#!/usr/bin/env python3
"""Convert a PDF with marker, falling back to sequential page ranges on failure."""

from __future__ import annotations

import argparse
import contextlib
import gc
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import traceback
from dataclasses import dataclass
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run marker_single on a full PDF, then fall back to sequential page ranges if it fails."
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output_dir", "--output-dir", type=Path, default=None)
    parser.add_argument("--page-range", "--page_range", dest="page_range", default=None)
    parser.add_argument("--marker-bin", default="marker_single")
    parser.add_argument("--chunk-size", type=int, default=1)
    parser.add_argument("--keep-temp", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    pdf = args.pdf.expanduser().resolve()
    if not pdf.exists():
        raise SystemExit(f"PDF not found: {pdf}")
    if args.chunk_size < 1:
        raise SystemExit("--chunk-size must be >= 1")

    marker_imports = load_marker_imports_or_reexec(args.marker_bin)

    if args.output_dir is None:
        out_dir = Path(tempfile.mkdtemp(prefix="para-zk-marker-")).resolve()
    else:
        out_dir = args.output_dir.expanduser().resolve()
    final_dir = out_dir / pdf.stem
    if final_dir.exists() and not args.overwrite:
        raise SystemExit(f"Output already exists: {final_dir} (pass --overwrite to replace it)")

    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Saving marker output to: {out_dir}", file=sys.stderr)
    if final_dir.exists():
        shutil.rmtree(final_dir)

    total_pages = count_pages(pdf)
    requested_pages = requested_page_numbers(total_pages, args.page_range)
    device = detect_torch_device()
    estimate = estimate_runtime(len(requested_pages), device)
    if device["device"] == "cpu":
        print(
            "WARNING: marker is running on CPU. PDF conversion can be very slow; 10 pages may take over 10 minutes.",
            file=sys.stderr,
        )
    elif device["device"] in {"cuda", "mps"}:
        print(
            f"Estimated marker runtime: {estimate['rtx3050_minutes_min']}-{estimate['rtx3050_minutes_max']} minutes "
            f"for {len(requested_pages)} page(s), using RTX 3050 baseline of 10 pages ~= 3-4 minutes.",
            file=sys.stderr,
        )
    marker_runtime = load_marker_runtime(marker_imports)
    full_log = out_dir / "marker-full.log"
    full_result = convert_with_marker(marker_runtime, args.marker_bin, pdf, out_dir, full_log, page_range=args.page_range)
    if full_result.returncode == 0:
        markdown = find_markdown(out_dir, pdf.stem)
        if markdown:
            emit_result(
                "single-pass",
                markdown,
                out_dir,
                scope=result_scope(args.page_range),
                page_range=args.page_range,
                pages=len(requested_pages),
                total_pages=total_pages,
                device=device,
                estimate=estimate,
            )
            return 0
        full_log.write_text(full_result.output + "\nmarker exited 0 but no Markdown output was found\n", encoding="utf-8")

    if final_dir.exists():
        shutil.rmtree(final_dir)
    if marker_runtime is not None:
        marker_runtime.clear_memory()

    temp_root = Path(tempfile.mkdtemp(prefix=f".{pdf.stem}-marker-pages-", dir=out_dir))
    chunks: list[dict[str, object]] = []
    try:
        for start, end in chunk_ranges(requested_pages, args.chunk_size):
            chunks.append(convert_chunk(marker_runtime, args.marker_bin, pdf, temp_root, start, end))
        markdown = merge_chunks(pdf, out_dir, chunks, total_pages)
    finally:
        if not args.keep_temp:
            shutil.rmtree(temp_root, ignore_errors=True)

    emit_result(
        "page-fallback",
        markdown,
        out_dir,
        scope=result_scope(args.page_range),
        page_range=args.page_range,
        pages=len(requested_pages),
        total_pages=total_pages,
        chunks=len(chunks),
        device=device,
        estimate=estimate,
    )
    return 0


@dataclass
class MarkerImports:
    ConfigParser: object
    create_model_dict: object
    save_output: object


@dataclass
class MarkerRuntime:
    ConfigParser: object
    create_model_dict: object
    save_output: object
    models: dict[str, object]

    def convert(self, pdf: Path, out_dir: Path, page_range: str | None, log_path: Path) -> subprocess.CompletedProcess[str]:
        command = marker_command("marker_single", pdf, out_dir, page_range)
        print(f"$ {' '.join(shell_quote(part) for part in command)}", file=sys.stderr)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            kwargs = {"output_dir": str(out_dir), "output_format": "markdown"}
            if page_range is not None:
                kwargs["page_range"] = page_range
            config_parser = self.ConfigParser(kwargs)
            with (
                log_path.open("w", encoding="utf-8") as log,
                contextlib.redirect_stdout(log),
                contextlib.redirect_stderr(Tee(log, sys.stderr)),
            ):
                converter_cls = config_parser.get_converter_cls()
                converter = converter_cls(
                    config=config_parser.generate_config_dict(),
                    artifact_dict=self.models,
                    processor_list=config_parser.get_processors(),
                    renderer=config_parser.get_renderer(),
                    llm_service=config_parser.get_llm_service(),
                )
                rendered = converter(str(pdf))
                out_folder = config_parser.get_output_folder(str(pdf))
                self.save_output(rendered, out_folder, config_parser.get_base_filename(str(pdf)))
            self.clear_memory()
            return subprocess.CompletedProcess(command, 0, log_path.read_text(encoding="utf-8", errors="replace"), "")
        except Exception:
            trace = traceback.format_exc()
            log_path.write_text(trace, encoding="utf-8")
            print(trace, file=sys.stderr)
            self.clear_memory()
            return subprocess.CompletedProcess(command, 1, trace, "")

    def clear_memory(self) -> None:
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


class Tee:
    def __init__(self, *streams: object):
        self.streams = streams

    def write(self, data: str) -> int:
        for stream in self.streams:
            stream.write(data)
        return len(data)

    def flush(self) -> None:
        for stream in self.streams:
            stream.flush()

    def isatty(self) -> bool:
        return any(getattr(stream, "isatty", lambda: False)() for stream in self.streams)


def load_marker_imports_or_reexec(marker_bin: str) -> MarkerImports | None:
    try:
        from marker.config.parser import ConfigParser
        from marker.models import create_model_dict
        from marker.output import save_output
    except ImportError:
        reexec_with_marker_python(marker_bin)
        try:
            from marker.config.parser import ConfigParser
            from marker.models import create_model_dict
            from marker.output import save_output
        except ImportError:
            return None

    return MarkerImports(ConfigParser=ConfigParser, create_model_dict=create_model_dict, save_output=save_output)


def load_marker_runtime(marker_imports: MarkerImports | None) -> MarkerRuntime | None:
    if marker_imports is None:
        return None
    print("Loading marker models once for this conversion process...", file=sys.stderr)
    return MarkerRuntime(
        ConfigParser=marker_imports.ConfigParser,
        create_model_dict=marker_imports.create_model_dict,
        save_output=marker_imports.save_output,
        models=marker_imports.create_model_dict(),
    )


def detect_torch_device() -> dict[str, object]:
    try:
        import torch

        if torch.cuda.is_available():
            index = torch.cuda.current_device()
            return {"device": "cuda", "name": torch.cuda.get_device_name(index), "index": index}
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            return {"device": "mps", "name": "Apple MPS"}
        return {"device": "cpu", "name": "CPU"}
    except Exception as exc:
        return {"device": "unknown", "name": type(exc).__name__}


def estimate_runtime(page_count: int, device: dict[str, object]) -> dict[str, object]:
    estimate = {
        "basis": "RTX 3050 baseline: 10 pages ~= 3-4 minutes",
        "pages": page_count,
        "rtx3050_minutes_min": round(page_count * 0.3, 1),
        "rtx3050_minutes_max": round(page_count * 0.4, 1),
    }
    if device["device"] == "cpu":
        estimate["warning"] = "CPU conversion is much slower; 10 pages can exceed 10 minutes."
    return estimate


def result_scope(page_range: str | None) -> str:
    return "page-range" if page_range is not None else "full-document"


def reexec_with_marker_python(marker_bin: str) -> None:
    if os.environ.get("MARKER_PDF_CONVERT_REEXEC") == "1":
        return
    marker_path = shutil.which(marker_bin) if not os.path.isabs(marker_bin) else marker_bin
    if not marker_path:
        return
    try:
        first_line = Path(marker_path).read_text(encoding="utf-8", errors="replace").splitlines()[0]
    except Exception:
        return
    if not first_line.startswith("#!") or "python" not in first_line.lower():
        return
    executable = first_line[2:].strip().split()[0]
    if Path(executable).resolve() == Path(sys.executable).resolve():
        return
    env = {**os.environ, "MARKER_PDF_CONVERT_REEXEC": "1"}
    os.execve(executable, [executable, str(Path(__file__).resolve()), *sys.argv[1:]], env)


def convert_with_marker(
    runtime: MarkerRuntime | None,
    marker_bin: str,
    pdf: Path,
    out_dir: Path,
    log_path: Path,
    page_range: str | None = None,
) -> subprocess.CompletedProcess[str]:
    if runtime is not None:
        return runtime.convert(pdf, out_dir, page_range, log_path)
    return run_marker(marker_command(marker_bin, pdf, out_dir, page_range), log_path)


def marker_command(marker_bin: str, pdf: Path, out_dir: Path, page_range: str | None) -> list[str]:
    command = [marker_bin, str(pdf)]
    if page_range is not None:
        command.extend(["--page_range", page_range])
    command.extend(["--output_dir", str(out_dir), "--output_format", "markdown"])
    return command


def requested_page_numbers(total_pages: int, page_range: str | None) -> list[int]:
    if page_range is None:
        return list(range(total_pages))
    return parse_page_range(page_range, total_pages)


def parse_page_range(page_range: str, total_pages: int) -> list[int]:
    pages: set[int] = set()
    for raw_part in page_range.split(","):
        part = raw_part.strip()
        if not part:
            continue
        if "-" in part:
            left, right = part.split("-", 1)
            start = int(left)
            end = int(right)
            if end < start:
                raise SystemExit(f"Invalid page range: {part}")
            pages.update(range(start, end + 1))
        else:
            pages.add(int(part))
    invalid = [page for page in pages if page < 0 or page >= total_pages]
    if invalid:
        raise SystemExit(f"Page range outside PDF bounds 0-{total_pages - 1}: {invalid}")
    return sorted(pages)


def chunk_ranges(pages: list[int], chunk_size: int) -> list[tuple[int, int]]:
    if not pages:
        return []
    chunks: list[tuple[int, int]] = []
    index = 0
    while index < len(pages):
        chunk = pages[index : index + chunk_size]
        start = chunk[0]
        end = chunk[-1]
        if chunk != list(range(start, end + 1)):
            for page in chunk:
                chunks.append((page, page))
        else:
            chunks.append((start, end))
        index += chunk_size
    return chunks


def run_marker(command: list[str], log_path: Path) -> subprocess.CompletedProcess[str]:
    print(f"$ {' '.join(shell_quote(part) for part in command)}", file=sys.stderr)
    proc = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    lines: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        lines.append(line)
        print(line, end="", file=sys.stderr)
    returncode = proc.wait()
    output = "".join(lines)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(output, encoding="utf-8")
    return subprocess.CompletedProcess(command, returncode, output, "")


def convert_chunk(
    runtime: MarkerRuntime | None,
    marker_bin: str,
    pdf: Path,
    temp_root: Path,
    start: int,
    end: int,
) -> dict[str, object]:
    chunk_dir = temp_root / f"pages-{start:04d}-{end:04d}"
    log_path = chunk_dir / "marker.log"
    page_range = str(start) if start == end else f"{start}-{end}"
    result = convert_with_marker(runtime, marker_bin, pdf, chunk_dir, log_path, page_range=page_range)
    markdown = find_markdown(chunk_dir, pdf.stem)
    if result.returncode != 0 or markdown is None:
        raise SystemExit(f"marker fallback failed for pages {page_range}; see {log_path}")
    return {"start": start, "end": end, "dir": chunk_dir, "markdown": markdown}


def merge_chunks(pdf: Path, out_dir: Path, chunks: list[dict[str, object]], page_count: int) -> Path:
    final_dir = out_dir / pdf.stem
    final_dir.mkdir(parents=True, exist_ok=True)
    parts: list[str] = []
    copied: set[str] = set()
    for chunk in chunks:
        markdown = Path(chunk["markdown"])
        chunk_text = markdown.read_text(encoding="utf-8")
        replacements: dict[str, str] = {}
        for source in markdown.parent.rglob("*"):
            if not source.is_file() or source == markdown or source.name.endswith("_meta.json"):
                continue
            rel = source.relative_to(markdown.parent).as_posix()
            target_rel = rel
            if target_rel in copied or (final_dir / target_rel).exists():
                target_rel = f"pages-{int(chunk['start']):04d}-{int(chunk['end']):04d}-{Path(rel).name}"
            target = final_dir / target_rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied.add(target_rel)
            replacements[rel] = target_rel
        parts.append(rewrite_links(chunk_text.strip(), replacements))

    final_markdown = final_dir / f"{pdf.stem}.md"
    final_markdown.write_text("\n\n".join(part for part in parts if part).rstrip() + "\n", encoding="utf-8")
    meta = {
        "source_pdf": str(pdf),
        "mode": "page-fallback",
        "page_count": page_count,
        "chunks": [{"start": chunk["start"], "end": chunk["end"]} for chunk in chunks],
    }
    (final_dir / f"{pdf.stem}_meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return final_markdown


def rewrite_links(markdown: str, replacements: dict[str, str]) -> str:
    for old, new in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        markdown = markdown.replace(f"]({old})", f"]({new})")
        markdown = markdown.replace(f'src="{old}"', f'src="{new}"')
    return markdown


def find_markdown(root: Path, stem: str) -> Path | None:
    preferred = root / stem / f"{stem}.md"
    if preferred.exists():
        return preferred
    matches = sorted(root.rglob("*.md"))
    return matches[0] if matches else None


def count_pages(pdf: Path) -> int:
    via_pdfinfo = count_pages_pdfinfo(pdf)
    if via_pdfinfo is not None:
        return via_pdfinfo
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader = module.PdfReader(str(pdf))
            return len(reader.pages)
        except Exception:
            pass
    try:
        import pypdfium2  # type: ignore

        doc = pypdfium2.PdfDocument(str(pdf))
        return len(doc)
    except Exception:
        pass
    raise SystemExit("Could not determine PDF page count; install poppler pdfinfo or pypdf.")


def count_pages_pdfinfo(pdf: Path) -> int | None:
    pdfinfo = shutil.which("pdfinfo")
    if not pdfinfo:
        return None
    try:
        result = subprocess.run(
            [pdfinfo, str(pdf)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except Exception:
        return None
    match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, re.MULTILINE)
    return int(match.group(1)) if match else None


def emit_result(mode: str, markdown: Path, output_dir: Path, **extra: object) -> None:
    scope = str(extra["scope"])
    pages = int(extra["pages"])
    total_pages = int(extra["total_pages"])
    device = extra["device"] if isinstance(extra.get("device"), dict) else {}
    device_name = str(device.get("device", "unknown"))
    chunks = extra.get("chunks")
    page_range = extra.get("page_range")

    print("OK")
    print(f"Markdown: {markdown}")
    print(f"Output dir: {output_dir}")
    print(f"Mode: {mode}")
    print(f"Scope: {scope}")
    if page_range is not None:
        print(f"Page range: {page_range}")
    print(f"Pages: {pages}/{total_pages}")
    if chunks is not None:
        print(f"Chunks: {chunks}")
    print(f"Device: {device_name}")


def shell_quote(value: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_@%+=:,./-]+", value):
        return value
    return "'" + value.replace("'", "'\"'\"'") + "'"


if __name__ == "__main__":
    raise SystemExit(main())

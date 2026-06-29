# PDF Conversion

Use this reference only when the source itself is a PDF, or when clean HTML/source rendering is
unavailable or incomplete.

## Preferred Path

Convert with marker; it recovers equations, tables, and figure files better than plain text
extraction or OCR.

Run the bundled converter script first:

```bash
uv run --with marker-pdf python scripts/marker_pdf_convert.py <file.pdf>
```

If `marker_single` is already on PATH, this can reuse that environment:

```bash
python3 scripts/marker_pdf_convert.py <file.pdf>
```

Useful arguments:
- Omit `--output_dir` to let the script choose a temp directory.
- Pass `--output_dir <dir>` to choose one.
- Pass `--page-range <range>` for selected pages.
- Use `--chunk-size <n>` only when needed.

Keep marker on local defaults. Do not use marker's LLM mode by default; the skill reviews and
cleans the Markdown after conversion.

## Runtime Guidance

The script prints the save directory, marker/tqdm progress, and device/runtime guidance on
stderr, with a short stdout result (`Markdown:`, `Mode:`, `Scope:`, `Pages:`, `Device:`).

If stdout says `Device: cpu`, warn the user that conversion will be very slow (10 pages can
exceed 10 minutes) and ask whether to continue, use a GPU-visible runtime, or narrow the page
range.

Install marker persistently (`uv tool install marker-pdf`, or venv + `pip install marker-pdf`)
only for repeated runs. The install/cache is heavy (Torch + models, several GB, first run can
take a few minutes); say so before starting.

If shell commands are sandboxed, the install/cache and run may need a less restricted runtime:
model download and GPU access can be blocked, and a resulting "no GPU" or blocked-network error
may indicate the sandbox rather than real hardware absence.

## Fallback

Only if there is no Python/marker path at all, use poppler:

```bash
pdftotext -layout <file.pdf>
pdftoppm -png -r 200 -f<page> -l<page> -x <x> -y <y> -W <w> -H <h> <file.pdf> <out-prefix>
```

Use `pdftotext -bbox` to find figure crop boxes; the figure usually sits between the preceding
paragraph's last line and the `Figure N:` caption.

## Cleanup

Treat converted Markdown as a draft, not a final note. Repair garbled captions, equation numbers
outside `\tag{}`, mis-leveled headings, broken tables, and duplicated headers. Attach useful
extracted figures with `para-zk:attach-file`; drop duplicate/debug images.

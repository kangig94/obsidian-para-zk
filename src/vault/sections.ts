export type TextRange = {
  start: number;
  end: number;
};

export type SectionContentRange = TextRange & {
  headingLevel: number;
};

export type SectionSplitHazard =
  | {
    kind: "heading";
    level: number;
  }
  | {
    kind: "thematicBreak";
    marker: string;
  };

export function yamlFrontmatterRange(content: string): TextRange | undefined {
  const openStart = content.startsWith("\uFEFF") ? 1 : 0;
  if (!content.startsWith("---\n", openStart) && !content.startsWith("---\r\n", openStart)) {
    return undefined;
  }

  const delimiter = /\r?\n---(?:\r?\n|$)/g;
  delimiter.lastIndex = openStart + 3;
  const match = delimiter.exec(content);
  if (!match) return undefined;
  return {
    start: 0,
    end: match.index + match[0].length
  };
}

export function spliceTextRange(content: string, range: TextRange, value: string): string {
  const before = content.slice(0, range.start);
  const after = content.slice(range.end);
  let replacement = value;
  if (replacement && after && !replacement.endsWith("\n")) {
    if (after.startsWith("\r\n") || after.startsWith("\n")) {
      if (startsWithMarkdownBoundary(after.replace(/^\r?\n/, "")) && !after.match(/^\r?\n\r?\n/)) {
        replacement = `${replacement}\n`;
      }
    } else {
      replacement = `${replacement}${startsWithMarkdownBoundary(after) ? "\n\n" : "\n"}`;
    }
  } else if (replacement && !after && !replacement.endsWith("\n")) {
    replacement = `${replacement}\n`;
  }
  return `${before}${replacement}${after}`;
}

export function markdownBodyRange(content: string): TextRange {
  const frontmatter = yamlFrontmatterRange(content);
  if (!frontmatter) return { start: 0, end: content.length };
  return {
    start: frontmatter.end,
    end: content.length
  };
}

export function findSectionContentRangeByHeading(
  content: string,
  heading: string,
  options: {
    offset: number;
  }
): TextRange | undefined {
  const target = findSectionContentTargetByHeading(content, heading, options);
  return target
    ? {
      start: target.start,
      end: target.end
    }
    : undefined;
}

export function findSectionContentTargetByHeading(
  content: string,
  heading: string,
  options: {
    offset: number;
    level?: number;
    exact?: boolean;
  }
): SectionContentRange | undefined {
  const match = findHeadingMatch(content, heading, options.level, options.exact ?? false);
  if (!match) return undefined;

  const level = match.groups?.hashes.length ?? 6;
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = headerEnd + lineBreakLengthAt(content, headerEnd);
  const after = content.slice(sectionStart);
  const nextBoundaryRel = nextSectionBoundary(after, level);
  const sectionEnd = nextBoundaryRel === -1 ? content.length : sectionStart + nextBoundaryRel;
  return {
    start: options.offset + sectionStart,
    end: options.offset + sectionEnd,
    headingLevel: level
  };
}

export function skipProjectSummaryManagedBlock(content: string, start: number, end: number): number {
  const nativeEnd = skipLeadingFencedBlockRange(content, start, end, "para-zk-latest-retro-summary");
  if (nativeEnd !== start) return nativeEnd;

  let cursor = start;
  const first = readLineSpan(content, cursor, end);
  if (!first?.text.trim().startsWith("> [!tip]")) return start;

  let fenceCount = 0;
  while (cursor < end) {
    const line = readLineSpan(content, cursor, end);
    if (!line) break;
    cursor = line.next;
    if (line.text.trim() === "> ```") fenceCount += 1;
    if (fenceCount === 2) break;
  }
  if (fenceCount < 2) return start;

  while (cursor < end) {
    const line = readLineSpan(content, cursor, end);
    if (!line || line.text.trim() !== "") break;
    cursor = line.next;
  }
  return cursor;
}

export function trailingManagedBlockStart(content: string, start: number, end: number): number | undefined {
  const slice = content.slice(start, end);
  const match = slice.match(/(?:\r?\n[ \t]*)*```para-zk-managed[^\r\n]*\r?\n```[ \t]*(?:\r?\n[ \t]*)*$/);
  return match?.index === undefined ? undefined : start + match.index;
}

export function readLineSpan(text: string, start: number, end: number): { text: string; next: number } | undefined {
  if (start >= end) return undefined;
  const lf = text.indexOf("\n", start);
  const rawEnd = lf === -1 || lf >= end ? end : lf;
  const lineEnd = rawEnd > start && text.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
  return {
    text: text.slice(start, lineEnd),
    next: lf === -1 || lf >= end ? end : lf + 1
  };
}

export function trimTextRange(content: string, start: number, end: number): TextRange {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/.test(content.charAt(trimmedStart))) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/.test(content.charAt(trimmedEnd - 1))) trimmedEnd -= 1;
  return {
    start: trimmedStart,
    end: trimmedEnd
  };
}

export function readSection(content: string, labels: string[]): string {
  const body = stripYamlFrontmatter(content);
  for (const label of labels) {
    const section = readSectionByHeading(body, label);
    if (section !== undefined) return section;
  }
  return "";
}

export function stripProjectSummaryManagedBlock(content: string): string {
  const nativeBlock = stripLeadingFencedBlock(content, "para-zk-latest-retro-summary");
  if (nativeBlock !== content) return nativeBlock;

  const lines = content.split("\n");
  if (!lines[0]?.trim().startsWith("> [!tip]")) return content;

  let fenceCount = 0;
  let index = 0;
  for (; index < lines.length; index += 1) {
    if (lines[index].trim() === "> ```") fenceCount += 1;
    if (fenceCount === 2) {
      index += 1;
      break;
    }
  }

  while (lines[index]?.trim() === "") index += 1;
  return trimMarkdownBlock(lines.slice(index).join("\n"));
}

export function stripManagedPrelude(content: string): string {
  return trimMarkdownBlock(
    stripTrailingManagedBlock(stripYamlFrontmatter(content).replace(/^\s*```para-zk-props\n[\s\S]*?\n```\s*/, ""))
  );
}

function stripYamlFrontmatter(content: string): string {
  const frontmatter = yamlFrontmatterRange(content);
  return frontmatter ? content.slice(frontmatter.end) : content;
}

export function trimMarkdownBlock(value: string): string {
  return value
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
}

export function lineTextRangeAt(
  content: string,
  start: number,
  maxEnd: number
): (TextRange & { endWithoutBreak: number }) | undefined {
  if (start >= maxEnd) return undefined;
  const newline = content.indexOf("\n", start);
  const end = newline === -1 || newline + 1 > maxEnd ? maxEnd : newline + 1;
  const rawEndWithoutBreak = newline === -1 || newline >= maxEnd ? maxEnd : newline;
  const endWithoutBreak = rawEndWithoutBreak > start && content.charAt(rawEndWithoutBreak - 1) === "\r"
    ? rawEndWithoutBreak - 1
    : rawEndWithoutBreak;
  return {
    start,
    end,
    endWithoutBreak
  };
}

export function removeTextRanges(content: string, ranges: TextRange[]): string {
  let result = content;
  const ordered = [...ranges].sort((left, right) => right.start - left.start);
  for (const range of ordered) {
    result = `${result.slice(0, range.start)}${result.slice(range.end)}`;
  }
  return result;
}

export function isMarkdownScaffold(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  if (text === "-" || text === "*" || text === "+") return true;
  if (isEmptyMarkdownTable(text)) return true;
  if (isPlaceholderBulletBlock(text)) return true;
  if (isHeadingOnlyBlock(text)) return true;
  return /^>\s*#{1,6}\s+\(.+\)\s*$/.test(text);
}

export function findSectionSplitHazard(
  value: string,
  sectionHeadingLevel: number
): SectionSplitHazard | undefined {
  let cursor = 0;
  while (cursor < value.length) {
    const line = readLineSpan(value, cursor, value.length);
    if (!line) break;

    const heading = line.text.match(/^\s*(#{1,6})\s+/);
    if (heading && heading[1].length <= sectionHeadingLevel) {
      return {
        kind: "heading",
        level: heading[1].length
      };
    }

    const thematicBreak = line.text.match(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/);
    if (thematicBreak) {
      return {
        kind: "thematicBreak",
        marker: thematicBreak[1].slice(0, 3)
      };
    }

    cursor = line.next;
  }
  return undefined;
}

function startsWithMarkdownBoundary(content: string): boolean {
  return /^(?:#{1,6}\s+|```|(?:-{3,}|\*{3,}|_{3,})\s*(?:\r?\n|$))/.test(content);
}

function skipLeadingFencedBlockRange(content: string, start: number, end: number, language: string): number {
  let cursor = start;
  const first = readLineSpan(content, cursor, end);
  if (!first || first.text.trim() !== `\`\`\`${language}`) return start;

  cursor = first.next;
  let closed = false;
  while (cursor < end) {
    const line = readLineSpan(content, cursor, end);
    if (!line) break;
    cursor = line.next;
    if (line.text.trim() === "```") {
      closed = true;
      break;
    }
  }
  if (!closed) return start;

  while (cursor < end) {
    const line = readLineSpan(content, cursor, end);
    if (!line || line.text.trim() !== "") break;
    cursor = line.next;
  }
  return cursor;
}

function readSectionByHeading(
  content: string,
  heading: string,
  level?: number
): string | undefined {
  const match = findHeadingMatch(content, heading, level, false);
  return readSectionByMatch(content, match);
}

function readSectionByMatch(content: string, match: RegExpMatchArray | null): string | undefined {
  if (!match) return undefined;

  const headingLevel = match.groups?.hashes.length ?? 6;
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = content.charAt(headerEnd) === "\n" ? headerEnd + 1 : headerEnd;
  const after = content.slice(sectionStart);
  const nextBoundaryRel = nextSectionBoundary(after, headingLevel);
  const sectionEnd = nextBoundaryRel === -1 ? content.length : sectionStart + nextBoundaryRel;
  return trimMarkdownBlock(stripTrailingManagedBlock(content.slice(sectionStart, sectionEnd)));
}

function findHeadingMatch(
  content: string,
  heading: string,
  level?: number,
  exact = false
): RegExpMatchArray | null {
  const headingPattern = escapeRegExp(heading).replace(/\s+/g, "\\s+");
  const hashesPattern = level === undefined ? "#{1,6}" : `#{${level}}`;
  const tailPattern = exact ? "\\s*(?:#+\\s*)?$" : "(?=\\s|$).*?$";
  const headerRe = new RegExp(`^\\s*(?<hashes>${hashesPattern})\\s+${headingPattern}${tailPattern}`, "im");
  return content.match(headerRe);
}

function nextSectionBoundary(content: string, maxHeadingLevel: number | undefined): number {
  const headingRe = maxHeadingLevel
    ? new RegExp(`^\\s*#{1,${maxHeadingLevel}}\\s+`, "m")
    : /^\s*#{1,6}\s+/m;
  const thematicBreakRe = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m;
  return minFoundIndex(content.search(headingRe), content.search(thematicBreakRe));
}

function minFoundIndex(left: number, right: number): number {
  if (left === -1) return right;
  if (right === -1) return left;
  return Math.min(left, right);
}

function stripLeadingFencedBlock(content: string, language: string): string {
  const lines = content.split("\n");
  const firstMeaningful = lines.findIndex((line) => line.trim() !== "");
  if (firstMeaningful === -1) return content;
  if (lines[firstMeaningful].trim() !== `\`\`\`${language}`) return content;

  let index = firstMeaningful + 1;
  for (; index < lines.length; index += 1) {
    if (lines[index].trim() === "```") {
      index += 1;
      break;
    }
  }

  while (lines[index]?.trim() === "") index += 1;
  return trimMarkdownBlock(lines.slice(index).join("\n"));
}

function stripTrailingManagedBlock(content: string): string {
  return content.replace(/(?:\r?\n[ \t]*)*```para-zk-managed[^\r\n]*\r?\n```[ \t]*(?:\r?\n[ \t]*)*$/, "");
}

function isEmptyMarkdownTable(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines.every((line) => line.includes("|"))) return false;
  const separatorIndex = lines.findIndex((line) => /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line));
  if (separatorIndex === -1) return false;
  const body = lines.slice(separatorIndex + 1);
  if (body.length === 0) return true;
  return body.every((line) => {
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    return cells.every((cell) => cell === "");
  });
}

function isPlaceholderBulletBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) => {
    const match = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (!match) return false;
    let body = (match[1] ?? "").trim();
    body = body.replace(/^\[[^\]\r\n]?\]\s*/, "").trim();
    return body === "" || body === "-" || /^\d{1,2}:\d{2}$/.test(body) || /^[^:]{1,80}:\s*$/.test(body);
  });
}

function isHeadingOnlyBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^#{1,6}\s+\S/.test(line));
}

function lineBreakLengthAt(content: string, index: number): number {
  if (content.slice(index, index + 2) === "\r\n") return 2;
  return content.charAt(index) === "\n" ? 1 : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

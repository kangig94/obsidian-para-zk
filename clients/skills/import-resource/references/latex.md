# LaTeX Compatibility

Use this reference whenever an import reads, converts, or writes LaTeX. Preserve the source's
mathematical intent, not its exact LaTeX spelling: normalize equivalent commands and layout when
Obsidian MathJax compatibility requires it.

## Supported notation

- Write inline math as `$…$` and display math as `$$…$$`.
- Do not use `\(...\)` or `\[...\]` as delimiters.
- Replace every `\bm` command with `\boldsymbol`; `\bm` is not available in the target
  Obsidian renderer.

For example:

```latex
% Avoid
\bm{x}

% Use
\boldsymbol{x}
```

## Matrix row boundaries

Never put a raw `[` at the start of a matrix cell immediately after a `\\` row break. TeX can
interpret the resulting `\\[` sequence as the optional row-spacing syntax rather than as the
next cell's opening bracket.

```latex
% Risky: the next row starts with a raw [
\begin{bmatrix}
a & b \\
[c] & d
\end{bmatrix}

% Safe: the next row starts with an explicit delimiter command
\begin{bmatrix}
a & b \\
\left[c\right] & d
\end{bmatrix}
```

Use `\\[<length>]` only when deliberately specifying row spacing:

```latex
\begin{bmatrix}
a & b \\[4pt]
c & d
\end{bmatrix}
```

When a matrix cell itself denotes a bracketed operator or expression, prefer explicit scalable
delimiters even when it is not immediately after a row break:

```latex
\left[\mathbf r_i \times\right]
```

The preventive rule is: **after a matrix row break, the next non-whitespace token must not be a
raw `[`**.

## Automated preflight

Run both scans against the completed draft before storing it:

```bash
rg -n -F '\bm' <draft.md>
rg -n -U '\\\\\s*\[' <draft.md>
```

The first command must return no matches. For every second-command match:

- keep it only when the brackets contain an intentional TeX length such as `[4pt]` or
  `[0.5em]`;
- otherwise treat it as a math-error candidate and replace the raw bracketed cell with explicit
  delimiters such as `\left[...\right]`.

Do not confuse an intentional `\\[4pt]` row-spacing option with the forbidden standalone `\[`
display-math delimiter.

## Renderer verification

A KaTeX parse or preview is useful only as a preflight; it is not final verification. KaTeX and
Obsidian MathJax accept different syntax and recover from errors differently.

After the note has been stored, open the actual note in Obsidian Reading view or Live Preview and
inspect every formula, with particular attention to matrices and bold symbols. Fix the stored
resource and render it again when any formula is missing, red, truncated, or structurally
different from the source's intended mathematics. If rendered Obsidian access is unavailable,
report that final renderer verification is still pending rather than claiming the import is
fully verified.

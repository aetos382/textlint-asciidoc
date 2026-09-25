import type { TableFormat } from "../parser/skeleton.js";
import type { SourceText } from "../text/SourceText.js";
import { LINE_COMMENT } from "./syntax.js";

/** 元のテキスト上のセル。 */
export interface SourceCell {
  /** セル指定子（`2+` など）または区切り文字の位置。 */
  readonly start: number;
  /** 前後の空白を除いたセルの中身。引用符で囲まれたセルでは引用符の内側。 */
  readonly contentStart: number;
  readonly contentEnd: number;
  /** 前後の空白を除いたセルの終わり。引用符を含む。 */
  readonly end: number;
  /** `3*|` のような指定で、同じセルが何個に複製されるか。 */
  readonly repeat: number;
}

// Asciidoctor の CellSpecStartRx と CellSpecEndRx。
const CELL_SPEC_START =
  /^[ \t]*(?:(\d+(?:\.\d*)?|(?:\d*\.)?\d+)([*+]))?([<^>](?:\.[<^>]?)?|(?:[<^>]?\.)?[<^>])?([a-z])?$/u;
const CELL_SPEC_END =
  /[ \t]+(?:(\d+(?:\.\d*)?|(?:\d*\.)?\d+)([*+]))?([<^>](?:\.[<^>]?)?|(?:[<^>]?\.)?[<^>])?([a-z])?$/u;

interface OpenCell {
  start: number;
  contentStart: number;
  repeat: number;
}

/**
 * 表の中身（開き区切り線と閉じ区切り線の間）をセルに分ける。
 */
export function splitTableCells(
  source: SourceText,
  start: number,
  end: number,
  format: TableFormat,
  separator: string,
): SourceCell[] {
  return format === "psv"
    ? splitPrefixSeparated(source, start, end, separator)
    : splitDelimited(source, start, end, format, separator);
}

/** PSV（`|` で始まるセル）。Asciidoctor の Parser.parseTable と同じ手順で区切る。 */
function splitPrefixSeparated(
  source: SourceText,
  start: number,
  end: number,
  separator: string,
): SourceCell[] {
  const cells: SourceCell[] = [];
  let open: OpenCell | undefined;

  const close = (contentEnd: number): void => {
    if (open) {
      cells.push(trimCell(source, open, contentEnd));
    }
  };

  for (const { offset, text } of lines(source, start, end)) {
    // Asciidoctor はテーブル内のコメント行を読み飛ばす。
    if (LINE_COMMENT.test(text)) {
      continue;
    }

    let position = 0;
    if (text.startsWith(separator)) {
      close(offset);
      open = { start: offset, contentStart: offset + separator.length, repeat: 1 };
      position = separator.length;
    } else {
      const index = text.indexOf(separator);
      if (index > 0) {
        const specPart = text.slice(0, index);
        const spec = CELL_SPEC_START.exec(specPart);
        if (spec && specPart.trim() !== "") {
          close(offset);
          open = {
            start: offset + specPart.length - specPart.trimStart().length,
            contentStart: offset + index + separator.length,
            repeat: repeatOf(spec),
          };
          position = index + separator.length;
        }
      }
    }

    for (
      let index = text.indexOf(separator, position);
      index !== -1;
      index = text.indexOf(separator, position)
    ) {
      if (text[index - 1] === "\\") {
        position = index + separator.length;
        continue;
      }
      const preMatch = text.slice(position, index);
      const spec = CELL_SPEC_END.exec(preMatch);
      const specStart =
        spec && spec[0].trimStart() !== ""
          ? position + spec.index + spec[0].length - spec[0].trimStart().length
          : index;
      close(offset + specStart);
      open = {
        start: offset + specStart,
        contentStart: offset + index + separator.length,
        repeat: spec ? repeatOf(spec) : 1,
      };
      position = index + separator.length;
    }
  }

  close(end);
  return cells;
}

/** CSV、TSV、DSV。行がレコードで、区切り文字と行末がセルを区切る。 */
function splitDelimited(
  source: SourceText,
  start: number,
  end: number,
  format: Exclude<TableFormat, "psv">,
  separator: string,
): SourceCell[] {
  const text = source.text;
  const quoted = format !== "dsv";
  const cells: SourceCell[] = [];
  let cellStart = start;
  let inQuotes = false;

  const close = (cellEnd: number): void => {
    let cell = trimCell(source, { start: cellStart, contentStart: cellStart, repeat: 1 }, cellEnd);
    // 引用符で囲まれたセルは、引用符の内側を中身とする。
    if (
      quoted &&
      cell.contentEnd - cell.contentStart >= 2 &&
      text[cell.contentStart] === '"' &&
      text[cell.contentEnd - 1] === '"'
    ) {
      cell = { ...cell, contentStart: cell.contentStart + 1, contentEnd: cell.contentEnd - 1 };
    }
    cells.push(cell);
  };

  for (const { offset, text: line } of lines(source, start, end)) {
    if (!inQuotes && (line.trim() === "" || LINE_COMMENT.test(line))) {
      cellStart = offset + line.length;
      continue;
    }
    if (!inQuotes) {
      cellStart = offset;
    }
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted && char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && line.startsWith(separator, i) && !(!quoted && line[i - 1] === "\\")) {
        close(offset + i);
        cellStart = offset + i + separator.length;
        i += separator.length - 1;
      }
    }
    if (!inQuotes) {
      close(offset + line.length);
    }
  }

  if (inQuotes) {
    close(end);
  }
  return cells;
}

function* lines(
  source: SourceText,
  start: number,
  end: number,
): Generator<{ offset: number; text: string }> {
  for (
    let line = source.lineOf(start);
    line <= source.lineCount && source.lineStart(line) < end;
    line++
  ) {
    const offset = Math.max(start, source.lineStart(line));
    yield { offset, text: source.text.slice(offset, Math.min(end, source.lineEnd(line))) };
  }
}

function repeatOf(spec: RegExpExecArray): number {
  return spec[2] === "*" ? Number.parseInt(spec[1]!, 10) || 1 : 1;
}

function trimCell(source: SourceText, cell: OpenCell, contentEnd: number): SourceCell {
  const content = source.text.slice(cell.contentStart, contentEnd);
  const contentStart = cell.contentStart + content.length - content.trimStart().length;
  const end = Math.max(contentStart, cell.contentStart + content.trimEnd().length);
  return { start: cell.start, contentStart, contentEnd: end, end, repeat: cell.repeat };
}

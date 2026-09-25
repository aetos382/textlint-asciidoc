import type { TxtNodePosition } from "@textlint/ast-node-types";

const LINE_TERMINATOR = /\r\n|\r|\n/g;

/**
 * 元のテキストに対する行とオフセットの対応表。
 *
 * Asciidoctor と同じく `\r\n`、`\r`、`\n` をそれぞれ 1 つの行終端として扱うので、
 * ここでの行番号は Asciidoctor の sourcemap が返す行番号と一致する。
 * テキスト自体は一切正規化しないので、オフセットは常に元のテキストを指す。
 */
export class SourceText {
  readonly text: string;
  readonly #lineStarts: number[] = [0];
  readonly #lineEnds: number[] = [];
  readonly #bomLength: number;

  constructor(text: string) {
    this.text = text;
    this.#bomLength = text.startsWith("﻿") ? 1 : 0;
    for (const match of text.matchAll(LINE_TERMINATOR)) {
      this.#lineEnds.push(match.index);
      this.#lineStarts.push(match.index + match[0].length);
    }
    this.#lineEnds.push(text.length);
  }

  get lineCount(): number {
    return this.#lineStarts.length;
  }

  /** 行の内容の開始オフセット。1 行目は BOM の直後を返す。 */
  lineStart(line: number): number {
    const index = this.#clamp(line) - 1;
    const start = this.#lineStarts[index]!;
    return index === 0 ? start + this.#bomLength : start;
  }

  /** 行の内容の終了オフセット（行終端の直前）。 */
  lineEnd(line: number): number {
    return this.#lineEnds[this.#clamp(line) - 1]!;
  }

  lineText(line: number): string {
    return this.text.slice(this.lineStart(line), this.lineEnd(line));
  }

  isBlankLine(line: number): boolean {
    return this.lineText(line).trim() === "";
  }

  /** オフセットを含む行の番号（1 始まり）。行終端上のオフセットはその行に属する。 */
  lineOf(offset: number): number {
    let low = 0;
    let high = this.#lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.#lineStarts[mid]! <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low + 1;
  }

  /** textlint の位置表現（行は 1 始まり、桁は 0 始まり）に変換する。 */
  position(offset: number): TxtNodePosition {
    const line = this.lineOf(offset);
    return { line, column: offset - this.#lineStarts[line - 1]! };
  }

  #clamp(line: number): number {
    return Math.min(Math.max(line, 1), this.#lineStarts.length);
  }
}

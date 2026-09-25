/**
 * パーサから受け取るブロック構造。
 *
 * パーサが教えてくれるのは「どの種類のブロックが何行目から始まるか」だけで、
 * 範囲やテキストは持たない。範囲は AST 層が元のテキストを走査して決める。
 * パーサを差し替えるときは、この形を作るアダプターだけを書けばよい。
 */

export interface SkeletonDocument {
  /** ドキュメント ヘッダーのタイトル行。ヘッダーがなければ undefined。 */
  readonly headerLine: number | undefined;
  readonly blocks: readonly SkeletonBlock[];
}

export type SkeletonBlock =
  | SkeletonSection
  | SkeletonCompound
  | SkeletonSimple
  | SkeletonList
  | SkeletonDescriptionList
  | SkeletonTable;

interface SkeletonBase {
  /** AsciiDoc のブロックの種類（Asciidoctor の context）。 */
  readonly context: string;
  readonly style: string | undefined;
  /** ブロック自身の構文が始まる行（1 始まり）。ブロック属性やタイトルの行は含まない。 */
  readonly line: number;
}

/** 節の見出しと、独立した見出し（discrete heading）。 */
export interface SkeletonSection extends SkeletonBase {
  readonly kind: "section";
  readonly level: number;
  readonly blocks: readonly SkeletonBlock[];
}

/** 他のブロックを内包するブロック。 */
export interface SkeletonCompound extends SkeletonBase {
  readonly kind: "compound";
  readonly blocks: readonly SkeletonBlock[];
}

/** 他のブロックを内包しないブロック。 */
export interface SkeletonSimple extends SkeletonBase {
  readonly kind: "simple";
  readonly language: string | undefined;
}

export interface SkeletonList extends SkeletonBase {
  readonly kind: "list";
  readonly items: readonly SkeletonListItem[];
}

export interface SkeletonListItem {
  readonly line: number;
  readonly hasText: boolean;
  readonly blocks: readonly SkeletonBlock[];
}

export interface SkeletonDescriptionList extends SkeletonBase {
  readonly kind: "dlist";
  readonly entries: readonly SkeletonDescriptionListEntry[];
}

export interface SkeletonDescriptionListEntry {
  /** 用語の行。用語自体の位置は AST 層がその行を走査して決める。 */
  readonly terms: readonly { readonly line: number }[];
  readonly description: SkeletonListItem | undefined;
}

export type TableFormat = "psv" | "csv" | "dsv" | "tsv";

export interface SkeletonTable extends SkeletonBase {
  readonly kind: "table";
  readonly format: TableFormat;
  /** セルの区切り文字。 */
  readonly separator: string;
  readonly rows: readonly SkeletonTableRow[];
}

export interface SkeletonTableRow {
  readonly section: "head" | "body" | "foot";
  readonly cells: readonly SkeletonTableCell[];
}

export interface SkeletonTableCell {
  readonly line: number;
  /** セルのスタイル（`asciidoc`、`literal` など）。 */
  readonly style: string | undefined;
  /** `asciidoc` スタイルのセルの中身。 */
  readonly blocks: readonly SkeletonBlock[] | undefined;
}

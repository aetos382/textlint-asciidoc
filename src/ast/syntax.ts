/**
 * 元のテキストの行を判定するための AsciiDoc の構文。
 *
 * Asciidoctor の rx.js にある同名の正規表現を参考にしているが、
 * 内部 API なので import はせず、必要な部分だけを写している。
 */

/**
 * 区切り線の行なら、対応する閉じ区切り線を返す。
 *
 * `----` などは開きと同じ行で閉じる。フェンス形式のコード ブロックは言語指定があっても ` ``` ` で閉じる。
 */
export function closingDelimiter(line: string): string | undefined {
  const trimmed = line.trimEnd();
  if (trimmed.startsWith("```")) {
    return "```";
  }
  if (trimmed === "--" || /^([-.=*_+/~])\1{3,}$/u.test(trimmed) || /^[|,:!]={3,}$/u.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

/** ATX 形式の節タイトル（`== Title`）。グループ 2 がタイトル。 */
export const ATX_SECTION_TITLE = /^(={1,6}|#{1,6})[ \t]+(\S.*?)(?:[ \t]+\1)?[ \t]*$/du;

/** 1 行の段落形式の注記（`NOTE: text`）のラベル。 */
export const ADMONITION_LABEL = /^(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION):[ \t]+/u;

/** リスト記号。`check` グループはチェックリストの印。 */
export const LIST_MARKERS: Readonly<Record<string, RegExp>> = {
  ulist: /^[ \t]*(?:-|\*{1,5}|•)[ \t]+(?:\[(?<check>[ xX*])\][ \t]+)?/u,
  olist: /^[ \t]*(?:\.{1,5}|\d+\.|[a-zA-Z]\.|[IVXLCDMivxlcdm]+\))[ \t]+/u,
  colist: /^[ \t]*<(?:\d+|\.)>[ \t]+/u,
};

/** 説明リストの用語の行。グループ 1 が用語、グループ 2 が同じ行に続く説明。 */
export const DESCRIPTION_LIST_TERM = /^[ \t]*(\S.*?)(?::{2,4}|;;)(?:[ \t]+(\S.*))?$/du;

export const LINE_COMMENT = /^\/\/(?!\/)/u;
export const BLOCK_COMMENT_DELIMITER = /^\/{4,}$/u;
/** 中身をコメントとして扱わせるブロック スタイル。 */
export const COMMENT_STYLE = /^\[comment(?:[,\]])/u;

/** 属性エントリ（`:name: value`）。 */
export const ATTRIBUTE_ENTRY = /^:!?[^\s:!][^:]*?!?:(?:[ \t]|$)/u;
/** 属性エントリの値が次の行に続くことを示す行末。 */
export const ATTRIBUTE_CONTINUATION = /[ \t](?:\\|\+)$/u;

/**
 * プリプロセッサ ディレクティブ（条件ディレクティブと include）。
 *
 * パース時には空行または消えた行として扱われるので、段落はここで終わる。
 */
export const PREPROCESSOR_DIRECTIVE = /^(?:ifdef|ifndef|ifeval|endif|include)::\S*?\[.*\]$/u;

/**
 * ブロックの前置き（属性、アンカー、タイトル）や、プリプロセッサ ディレクティブ、
 * リストの継続記号など、本文を持たない構文の行。
 */
export const NON_CONTENT_LINE =
  /^(?:\[.*\]|\.(?![\s.]).*|\\?(?:ifdef|ifndef|ifeval|endif|include)::.*|\+)$/u;

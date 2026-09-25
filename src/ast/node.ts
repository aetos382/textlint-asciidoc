import type { TxtNode } from "@textlint/ast-node-types";

import type { SourceText } from "../text/SourceText.js";

/** 標準のノード型に写した AsciiDoc のブロックの、元の種類。 */
export interface AsciidocInfo {
  readonly context: string;
  readonly style?: string | undefined;
}

/** AsciiDoc のブロックから作ったノード。 */
export type WithAsciidoc<T extends TxtNode> = T & { readonly asciidoc: AsciidocInfo };

/** AsciiDoc のブロックから作ることも、ブロックの一部から作ることもあるノード。 */
export type MaybeWithAsciidoc<T extends TxtNode> = T & { readonly asciidoc?: AsciidocInfo };

/**
 * ノード固有のプロパティ。
 *
 * AsciiDoc では標準の内容モデルに収まらない入れ子（段落内のコメントなど）が生じるので、
 * `children` は任意のノードを受け付ける。
 */
type NodeProps<T extends TxtNode> = Omit<T, keyof TxtNode | "children"> &
  ("children" extends keyof T ? { readonly children: readonly TxtNode[] } : unknown);

/**
 * ノードを作る。
 *
 * `raw` と `loc` は必ず `range` から求めるので、`raw === text.slice(...range)` が常に成り立つ。
 */
export function createNode<T extends TxtNode>(
  source: SourceText,
  type: T["type"],
  start: number,
  end: number,
  props: NodeProps<T>,
): T {
  return {
    type,
    raw: source.text.slice(start, end),
    range: [start, end],
    loc: { start: source.position(start), end: source.position(end) },
    ...props,
  } as unknown as T;
}

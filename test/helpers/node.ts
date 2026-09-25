import type { TxtNode } from "@textlint/ast-node-types";

/** テストで各ノードの固有プロパティを参照するための緩い型。 */
export type LooseNode = TxtNode & {
  readonly value?: string;
  readonly children?: readonly LooseNode[];
};

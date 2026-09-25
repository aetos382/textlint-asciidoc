import type { TxtNodePosition } from "@textlint/ast-node-types";
import { expect } from "vitest";

import type { LooseNode } from "./node.js";

/**
 * AST の全ノードが元のテキストと矛盾しないことを検証する。
 *
 * - `raw` が `range` の指す元のテキストと一致する。
 * - `loc` が `range` と一致する（SourceText とは別の素朴な実装で求めて比べる）。
 * - 子ノードが親の範囲に収まり、互いに重ならず、順に並んでいる。
 * - Str の `value` が `raw` と一致する。
 */
export function assertInvariants(root: LooseNode, text: string): void {
  const visit = (node: LooseNode, path: string): void => {
    const [start, end] = node.range;
    const where = `${path} (${node.type} [${start}, ${end}])`;

    expect(start, where).toBeLessThanOrEqual(end);
    expect(node.raw, where).toBe(text.slice(start, end));
    expect(node.loc, where).toEqual({ start: position(text, start), end: position(text, end) });
    if (node.type === "Str") {
      expect(node.value, where).toBe(node.raw);
    }

    const children = node.children ?? [];
    let previousEnd = start;
    children.forEach((child, i) => {
      expect(
        child.range[0],
        `${where} child ${i} starts before previous sibling ends`,
      ).toBeGreaterThanOrEqual(previousEnd);
      expect(child.range[1], `${where} child ${i} ends outside parent`).toBeLessThanOrEqual(end);
      previousEnd = child.range[1];
      visit(child, `${path}/${i}`);
    });
  };

  visit(root, "");
}

// @textlint/ast-node-types の BlockContent。
const BLOCK_CONTENT = new Set([
  "Paragraph",
  "Header",
  "HorizontalRule",
  "BlockQuote",
  "List",
  "Table",
  "Html",
  "CodeBlock",
]);

// @textlint/ast-node-types の PhrasingContent。
const PHRASING_CONTENT = new Set([
  "Link",
  "Str",
  "Emphasis",
  "Strong",
  "Delete",
  "Html",
  "Code",
  "Break",
  "Image",
  "Comment",
]);

/** 子の種類が制限されているノードと、許される子の種類。 */
const CONTENT_MODELS: Readonly<Record<string, ReadonlySet<string>>> = {
  List: new Set(["ListItem"]),
  ListItem: BLOCK_CONTENT,
  BlockQuote: BLOCK_CONTENT,
};

/**
 * `@textlint/ast-node-types` が子の種類を制限しているノードについて、制限を守っていることを検証する。
 *
 * TableCell の子は本来 PhrasingContent に限られるが、asciidoc スタイル（`a`）のセルは
 * 中身がブロックの並びなので、ブロック要素を子に持つことを許している。
 * そのため TableCell については、子がすべてインライン要素か、すべてブロック要素かの
 * どちらかであり、両者が混ざらないことだけを確かめる。
 */
export function assertContentModel(root: LooseNode): void {
  const visit = (node: LooseNode, path: string): void => {
    const children = node.children ?? [];
    const allowed =
      node.type === "TableCell" && !children.every((child) => PHRASING_CONTENT.has(child.type))
        ? BLOCK_CONTENT
        : CONTENT_MODELS[node.type];
    children.forEach((child, i) => {
      if (allowed) {
        expect(allowed.has(child.type), `${path}/${i}: ${child.type} in ${node.type}`).toBe(true);
      }
      visit(child, `${path}/${i}`);
    });
  };

  visit(root, "");
}

function position(text: string, offset: number): TxtNodePosition {
  const before = text.slice(0, offset);
  const terminators = [...before.matchAll(/\r\n|\r|\n/g)];
  const last = terminators.at(-1);
  return {
    line: terminators.length + 1,
    column: last ? offset - (last.index + last[0].length) : offset,
  };
}

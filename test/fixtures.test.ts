import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { test as testAST } from "@textlint/ast-tester";
import { describe, expect, test } from "vitest";

import { parse } from "../src/parse.js";
import { assertContentModel, assertInvariants } from "./helpers/invariants.js";
import type { LooseNode } from "./helpers/node.js";

const fixturesDir = join(import.meta.dirname, "fixtures");
const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe.each(fixtures)("%s", (name) => {
  const input = readFileSync(join(fixturesDir, name, "input.adoc"), "utf8");

  /**
   * 変換結果が textlint の AST として正しく、子の種類の制限を守り、元のテキストと矛盾せず、
   * 記録済みの期待結果（output.json）と一致することを確認する。
   */
  test("produces the expected AST", async () => {
    const ast = await parse(input);

    testAST(ast as unknown as Record<string, unknown>);
    assertInvariants(ast, input);
    assertContentModel(ast);
    await expect(`${JSON.stringify(ast, null, 2)}\n`).toMatchFileSnapshot(
      join(fixturesDir, name, "output.json"),
    );
  });

  /**
   * 改行コードが CRLF や CR でも、LF のときと同じ構造と行・桁位置になることを確認する。
   * オフセットは改行コードの長さの分だけずれるので比べない。
   */
  test.each([
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ])("gives the same structure with %s line endings", async (_, newline) => {
    const text = input.replaceAll("\n", newline);
    const ast = await parse(text);

    testAST(ast as unknown as Record<string, unknown>);
    assertInvariants(ast, text);
    expect(shape(ast)).toEqual(shape(await parse(input)));
  });
});

/** 改行コードに依存しない部分だけを取り出す。 */
function shape(node: LooseNode): unknown {
  return {
    type: node.type,
    loc: node.loc,
    ...(node.type === "Str" && { value: normalizeNewlines(node.value ?? "") }),
    ...(node.children && { children: node.children.map(shape) }),
  };
}

function normalizeNewlines(text: string): string {
  return text.replaceAll(/\r\n?/g, "\n");
}

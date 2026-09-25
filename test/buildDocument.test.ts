import { describe, expect, test } from "vitest";

import { buildDocument } from "../src/ast/buildDocument.js";
import type { SkeletonBlock } from "../src/parser/skeleton.js";
import { SourceText } from "../src/text/SourceText.js";
import { assertInvariants } from "./helpers/invariants.js";

function build(text: string, blocks: SkeletonBlock[]) {
  const ast = buildDocument(new SourceText(text), { headerLine: undefined, blocks });
  assertInvariants(ast, text);
  return ast;
}

function paragraph(line: number): SkeletonBlock {
  return { kind: "simple", context: "paragraph", style: undefined, line, language: undefined };
}

describe("buildDocument", () => {
  /**
   * パーサが報告しなかった本文の行も、取りこぼさずに段落として出力されることを確認する。
   * 拡張機能が作ったブロックなど、位置の分からないブロックがあっても本文が検査対象から漏れないことを保証する。
   */
  test("keeps prose that the parser did not report", () => {
    const text = "Known paragraph.\n\nUnknown paragraph.\n";

    expect(build(text, [paragraph(1)]).children).toMatchObject([
      { type: "Paragraph", raw: "Known paragraph.", asciidoc: { context: "paragraph" } },
      { type: "Paragraph", raw: "Unknown paragraph.", asciidoc: { context: "unknown" } },
    ]);
  });

  /**
   * 未知の種類のブロックも、落とさずに段落として出力し、元の種類を保持することを確認する。
   */
  test("maps unknown block contexts to paragraphs", () => {
    const text = "[custom]\nCustom block content.\n";
    const block: SkeletonBlock = {
      kind: "simple",
      context: "custom_block",
      style: "custom",
      line: 2,
      language: undefined,
    };

    expect(build(text, [block]).children).toMatchObject([
      {
        type: "Paragraph",
        raw: "Custom block content.",
        asciidoc: { context: "custom_block", style: "custom" },
      },
    ]);
  });

  /**
   * 構文だけの行（属性エントリ、ブロック属性、ブロック タイトル、ディレクティブ）は
   * ギャップにあっても段落にしないことを確認する。
   */
  test("skips syntax-only lines in gaps", () => {
    const text = [
      ":name: value",
      "[source,ruby]",
      ".Title",
      "ifdef::attr[]",
      "include::file.adoc[]",
      "endif::[]",
      "+",
      "",
    ].join("\n");

    expect(build(text, []).children).toEqual([]);
  });
});

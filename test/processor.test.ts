import { TextlintKernel } from "@textlint/kernel";
import type { TextlintRuleModule } from "@textlint/types";
import { describe, expect, test } from "vitest";

import plugin from "../src/index.js";

/** Str に含まれる「TODO」をすべて報告するルール。 */
const noTodo: TextlintRuleModule = (context) => {
  const { Syntax, RuleError, report, locator } = context;
  return {
    [Syntax.Str](node) {
      for (const match of node.value.matchAll(/TODO/g)) {
        report(
          node,
          new RuleError("Found TODO.", {
            padding: locator.range([match.index, match.index + match[0].length]),
          }),
        );
      }
    },
  };
};

/** textlint で検査し、報告された位置を返す。`start` の桁はメッセージの仕様どおり 1 始まり。 */
async function lint(text: string, options?: Record<string, unknown>) {
  const kernel = new TextlintKernel();
  const result = await kernel.lintText(text, {
    ext: ".adoc",
    plugins: [{ pluginId: "asciidoc", plugin, ...(options && { options }) }],
    rules: [{ ruleId: "no-todo", rule: noTodo }],
  });
  return result.messages.map((message) => ({
    range: message.range,
    start: message.loc.start,
    text: text.slice(...message.range),
  }));
}

describe("with textlint", () => {
  /**
   * 散文中の各所（段落、見出し、強調の中、リスト、表のセル、注記）の指摘が、
   * 元のテキスト上の正しい位置で報告されることを確認する。
   */
  test("reports problems in prose at their original positions", async () => {
    const text = [
      "= TODO title",
      "",
      "Paragraph with TODO and *strong TODO*.",
      "",
      "* List TODO",
      "",
      "|===",
      "|Cell TODO",
      "|===",
      "",
      "NOTE: Admonition TODO.",
      "",
    ].join("\n");

    expect(await lint(text)).toEqual([
      { range: [2, 6], start: { line: 1, column: 3 }, text: "TODO" },
      { range: [29, 33], start: { line: 3, column: 16 }, text: "TODO" },
      { range: [46, 50], start: { line: 3, column: 33 }, text: "TODO" },
      { range: [61, 65], start: { line: 5, column: 8 }, text: "TODO" },
      { range: [78, 82], start: { line: 8, column: 7 }, text: "TODO" },
      { range: [106, 110], start: { line: 11, column: 18 }, text: "TODO" },
    ]);
  });

  /**
   * コード、コメント、属性エントリ、ディレクティブなど、散文でない部分は
   * Str にならず、Str を対象とするルールから指摘されないことを確認する。
   */
  test("does not report problems outside prose", async () => {
    const text = [
      ":attribute: TODO",
      "// TODO comment",
      "",
      "Inline `TODO` code.",
      "",
      "----",
      "TODO in a listing block",
      "----",
      "",
      "////",
      "TODO in a block comment",
      "////",
      "",
      "include::TODO.adoc[]",
      "",
    ].join("\n");

    expect(await lint(text)).toEqual([]);
  });

  /**
   * 改行コードが CRLF でも、報告される位置が元のテキストのオフセットと一致することを確認する。
   */
  test("reports correct positions with CRLF line endings", async () => {
    const text = "First line.\r\n\r\nSecond TODO.\r\n";

    expect(await lint(text)).toEqual([
      { range: [22, 26], start: { line: 3, column: 8 }, text: "TODO" },
    ]);
  });
});

describe("options", () => {
  /** `extensions` オプションで、AsciiDoc として扱う拡張子を追加できることを確認する。 */
  test("extensions adds file extensions", () => {
    const processor = new plugin.Processor({ extensions: [".txt"] });

    expect(processor.availableExtensions()).toEqual([".adoc", ".asciidoc", ".asc", ".txt"]);
  });

  /** 不正な型のオプションは、設定の誤りとして例外を発生させることを確認する。 */
  test.each([
    { extensions: ".txt" },
    { extensions: [1] },
    { attributes: "foo=bar" },
    { attributes: { foo: 1 } },
  ])("rejects invalid options: %o", (options) => {
    expect(() => new plugin.Processor(options)).toThrow(TypeError);
  });

  /** `attributes` オプションが Asciidoctor に渡され、パース結果に反映されることを確認する。 */
  test("attributes are passed to Asciidoctor", async () => {
    // idprefix などの属性はパース結果に現れないので、節番号の開始レベルに影響する
    // leveloffset で確認する。
    const text = "= Title\n\n== Section\n";
    const processor = new plugin.Processor({ attributes: { leveloffset: "+1" } });
    const ast = await processor.processor(".adoc").preProcess(text);

    expect(ast).toMatchObject({
      children: [
        { type: "Header", depth: 2 },
        { type: "Header", depth: 3 },
      ],
    });
  });
});

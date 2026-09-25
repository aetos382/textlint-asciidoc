/**
 * Asciidoctor.js で AsciiDoc をパースし、{@link SkeletonDocument} に写す。
 *
 * `@asciidoctor/core` を import してよいのはこのファイルだけ。
 */

import {
  Extensions,
  IncludeProcessor,
  load,
  Preprocessor,
  type AbstractBlock,
  type Document,
  type List,
  type ListItem,
  type PreprocessorReader,
  type Section,
} from "@asciidoctor/core";

import type {
  SkeletonBlock,
  SkeletonDocument,
  SkeletonListItem,
  SkeletonTable,
  SkeletonTableRow,
  TableFormat,
} from "./skeleton.js";

export interface ParseOptions {
  /** Asciidoctor に渡すドキュメント属性。 */
  readonly attributes?: Readonly<Record<string, string>> | undefined;
}

// Asciidoctor の ConditionalDirectiveRx と同じ形。
const CONDITIONAL_DIRECTIVE = /^(\\)?(?:ifdef|ifndef|ifeval|endif)::\S*?\[.*\]$/;

/**
 * 条件ディレクティブの行を空行に置き換え、条件にかかわらず全分岐をパースさせる。
 *
 * 行を消すのではなく空行に置き換えるので、後続の行番号は元のテキストと一致したままになる。
 */
class ConditionalNeutralizer extends Preprocessor {
  override process(_document: Document, reader: PreprocessorReader): PreprocessorReader {
    const lines = reader.lines;
    for (let i = 0; i < lines.length; i++) {
      const match = CONDITIONAL_DIRECTIVE.exec(lines[i]!);
      if (match && !match[1]) {
        lines[i] = "";
      }
    }
    return reader;
  }
}

/**
 * include ディレクティブを横取りして何もしない。
 *
 * 既定の処理に任せると、ファイルを読みに行ったり、ディレクティブをリンクに書き換えたりする。
 * 横取りすればディレクティブの行が消費されるだけなので、後続の行番号もずれない。
 */
class IncludeSuppressor extends IncludeProcessor {
  override handles(): boolean {
    return true;
  }

  override process(): void {}
}

export async function parseAsciidoc(
  text: string,
  options: ParseOptions = {},
): Promise<SkeletonDocument> {
  const registry = Extensions.create();
  registry.preprocessor(ConditionalNeutralizer);
  registry.includeProcessor(IncludeSuppressor);

  const document = await load(text, {
    sourcemap: true,
    attributes: options.attributes,
    extension_registry: registry,
    // 警告を stderr に出さない。
    logger: null,
  });

  return {
    headerLine: document.hasHeader() ? document.header?.getLineNumber() : undefined,
    blocks: convertBlocks(document.getBlocks()),
  };
}

function convertBlocks(blocks: readonly AbstractBlock[]): SkeletonBlock[] {
  return blocks.flatMap((block) => convertBlock(block));
}

function convertBlock(block: AbstractBlock): SkeletonBlock[] {
  const context = block.getContext();
  const line = block.getLineNumber();

  // preamble は構文上の実体を持たないので、中身だけを親に展開する。
  if (context === "preamble") {
    return convertBlocks(block.getBlocks());
  }

  // 拡張機能が作ったブロックなど、位置の分からないものは扱えない。
  // その行はギャップとして AST 層が拾う。
  if (line === undefined) {
    return [];
  }

  const base = { context, style: block.getStyle() ?? undefined, line };

  switch (context) {
    case "section":
    case "floating_title":
      return [
        {
          ...base,
          kind: "section",
          level: (block as unknown as Section).getLevel() ?? 1,
          blocks: convertBlocks(block.getBlocks()),
        },
      ];

    case "ulist":
    case "olist":
    case "colist":
      return [
        {
          ...base,
          kind: "list",
          items: (block as unknown as List).getItems().map((item) => convertListItem(item)),
        },
      ];

    case "dlist":
      return [
        {
          ...base,
          kind: "dlist",
          entries: (block as unknown as DescriptionList).getItems().map(([terms, description]) => ({
            terms: terms.map((term) => ({ line: term.getLineNumber() ?? line })),
            description: description ? convertListItem(description) : undefined,
          })),
        },
      ];

    case "table":
      return [convertTable(block as unknown as Table, base)];
  }

  if (block.getContentModel() === "compound") {
    return [{ ...base, kind: "compound", blocks: convertBlocks(block.getBlocks()) }];
  }

  const language: unknown = block.getAttribute("language");
  return [
    {
      ...base,
      kind: "simple",
      language: typeof language === "string" ? language : undefined,
    },
  ];
}

function convertListItem(item: ListItem): SkeletonListItem {
  return {
    line: item.getLineNumber() ?? 0,
    hasText: item.hasText(),
    blocks: convertBlocks(item.getBlocks()),
  };
}

// Asciidoctor.js は Table と説明リストの型を公開していないので、使う部分だけを定義する。

interface DescriptionList {
  getItems(): [ListItem[], ListItem | null][];
}

interface Table extends AbstractBlock {
  readonly rows: { bySection(): [string, TableCell[][]][] };
  readonly document: Document;
}

interface TableCell {
  readonly lineno: number | undefined;
  readonly style: string | null | undefined;
  getInnerDocument(): Document | null;
}

const TABLE_FORMATS = new Set<string>(["psv", "csv", "dsv", "tsv"]);

const DEFAULT_SEPARATORS: Record<TableFormat, string> = {
  psv: "|",
  csv: ",",
  dsv: ":",
  tsv: "\t",
};

function convertTable(
  table: Table,
  base: { context: string; style: string | undefined; line: number },
): SkeletonTable {
  const formatAttribute: unknown = table.getAttribute("format");
  const format: TableFormat =
    typeof formatAttribute === "string" && TABLE_FORMATS.has(formatAttribute)
      ? (formatAttribute as TableFormat)
      : "psv";

  // Asciidoctor の Table.ParserContext と同じ規則で区切り文字を決める。
  const separatorAttribute: unknown = table.getAttribute("separator");
  let separator: string;
  if (typeof separatorAttribute === "string" && separatorAttribute !== "") {
    separator = separatorAttribute === "\\t" ? "\t" : separatorAttribute;
  } else if (format === "psv" && table.document.nested()) {
    separator = "!";
  } else {
    separator = DEFAULT_SEPARATORS[format];
  }

  const rows: SkeletonTableRow[] = [];
  for (const [section, sectionRows] of table.rows.bySection()) {
    for (const cells of sectionRows) {
      rows.push({
        section: section as SkeletonTableRow["section"],
        cells: cells.map((cell) => {
          const inner = cell.style === "asciidoc" ? cell.getInnerDocument() : null;
          return {
            line: cell.lineno ?? base.line,
            style: cell.style ?? undefined,
            blocks: inner ? convertBlocks(inner.getBlocks()) : undefined,
          };
        }),
      });
    }
  }

  return { ...base, kind: "table", format, separator, rows };
}

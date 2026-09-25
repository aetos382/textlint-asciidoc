import type {
  TxtBlockQuoteNode,
  TxtCodeBlockNode,
  TxtCodeNode,
  TxtCommentNode,
  TxtDocumentNode,
  TxtHeaderNode,
  TxtHorizontalRuleNode,
  TxtHtmlNode,
  TxtListItemNode,
  TxtListNode,
  TxtNode,
  TxtParagraphNode,
  TxtTableCellNode,
  TxtTableNode,
  TxtTableRowNode,
} from "@textlint/ast-node-types";

import { parseInline } from "../inline/parseInline.js";
import type {
  SkeletonBlock,
  SkeletonCompound,
  SkeletonDescriptionList,
  SkeletonDescriptionListEntry,
  SkeletonDocument,
  SkeletonList,
  SkeletonListItem,
  SkeletonSection,
  SkeletonSimple,
  SkeletonTable,
  SkeletonTableCell,
} from "../parser/skeleton.js";
import type { SourceText } from "../text/SourceText.js";
import {
  createNode,
  type AsciidocInfo,
  type MaybeWithAsciidoc,
  type WithAsciidoc,
} from "./node.js";
import {
  ADMONITION_LABEL,
  ATTRIBUTE_CONTINUATION,
  ATTRIBUTE_ENTRY,
  ATX_SECTION_TITLE,
  BLOCK_COMMENT_DELIMITER,
  closingDelimiter,
  COMMENT_STYLE,
  DESCRIPTION_LIST_TERM,
  LINE_COMMENT,
  LIST_MARKERS,
  NON_CONTENT_LINE,
  PREPROCESSOR_DIRECTIVE,
} from "./syntax.js";
import { splitTableCells, type SourceCell } from "./tableCells.js";

/** オフセットの半開区間 `[start, end)`。 */
interface Region {
  readonly start: number;
  readonly end: number;
}

interface Built {
  readonly nodes: TxtNode[];
  /** ブロックが消費した範囲の終わり。ここから先はギャップとして扱われる。 */
  readonly end: number;
}

/** 区切り線で囲まれたブロック。 */
interface Fence {
  /** 区切り線の間。 */
  readonly inner: Region;
  /** 閉じ区切り線の終わり。閉じていなければ中身の終わり。 */
  readonly end: number;
}

/** コード ブロックとして扱うブロック。 */
const CODE_CONTEXTS = new Set(["listing", "literal", "stem"]);
/** 本文を持たないブロック マクロなど。何も出力しない。 */
const NON_PROSE_CONTEXTS = new Set(["image", "audio", "video", "toc", "page_break"]);
/** BlockQuote に写す、他のブロックを囲む種類のブロック。 */
const QUOTE_LIKE_CONTEXTS = new Set([
  "admonition",
  "example",
  "sidebar",
  "open",
  "quote",
  "verse",
  "abstract",
  "partintro",
]);

/** ドキュメント ヘッダーでタイトルに続く、著者行と版数行の最大数。 */
const MAX_HEADER_INFO_LINES = 2;

export function buildDocument(source: SourceText, skeleton: SkeletonDocument): TxtDocumentNode {
  const builder = new Builder(source);
  const region = { start: source.lineStart(1), end: source.text.length };
  const children: TxtNode[] = [];

  let blocksStart = region.start;
  if (skeleton.headerLine !== undefined) {
    const headerStart = Math.max(region.start, source.lineStart(skeleton.headerLine));
    const firstBlock = skeleton.blocks[0];
    const headerEnd = firstBlock ? source.lineStart(firstBlock.line) : region.end;
    children.push(...builder.gap(region.start, headerStart));
    const header = builder.documentHeader({ start: headerStart, end: headerEnd });
    children.push(header.node);
    blocksStart = header.end;
  }

  children.push(
    ...builder.blocks(skeleton.blocks, { start: blocksStart, end: region.end }, true).nodes,
  );

  return createNode<TxtDocumentNode>(source, "Document", 0, source.text.length, { children });
}

class Builder {
  readonly #source: SourceText;

  constructor(source: SourceText) {
    this.#source = source;
  }

  /**
   * 兄弟ブロックを順に組み立てる。
   *
   * `includeTrailing` が真なら、最後のブロックの後ろから `region` の終わりまでもギャップとして走査する。
   */
  blocks(blocks: readonly SkeletonBlock[], region: Region, includeTrailing: boolean): Built {
    const built = this.#siblings(blocks, region, (block, blockRegion) =>
      this.#block(block, blockRegion),
    );
    if (!includeTrailing) {
      return built;
    }
    return { nodes: [...built.nodes, ...this.gap(built.end, region.end)], end: region.end };
  }

  documentHeader(region: Region): { node: TxtNode; end: number } {
    const source = this.#source;
    const header = this.#header(region, 0, { context: "document" });

    // タイトルに続く著者行と版数行は本文ではないので、消費するだけでノードにしない。
    let end = header.end;
    for (
      let line = source.lineOf(header.end) + 1, count = 0;
      count < MAX_HEADER_INFO_LINES && this.#lineWithin(line, region.end);
      line++, count++
    ) {
      const text = source.lineText(line);
      if (text.trim() === "" || text.startsWith(":") || LINE_COMMENT.test(text)) {
        break;
      }
      end = source.lineEnd(line);
    }
    return { node: header.node, end };
  }

  /**
   * ブロックに属さない範囲を走査する。
   *
   * Asciidoctor はコメントを構文木に残さないので、ここで拾って Comment にする。
   * 属性エントリやブロック属性などの構文の行は読み飛ばす。
   * それ以外の行は、取りこぼしを避けるために段落として出力する。
   */
  gap(start: number, end: number): TxtNode[] {
    const source = this.#source;
    const nodes: TxtNode[] = [];

    for (let line = source.lineOf(start); this.#lineWithin(line, end);) {
      const lineStart = Math.max(start, source.lineStart(line));
      const lineEnd = Math.min(end, source.lineEnd(line));
      const raw = source.text.slice(lineStart, lineEnd);
      const text = raw.trim();
      const first = lineStart + raw.length - raw.trimStart().length;

      if (text === "") {
        line++;
      } else if (BLOCK_COMMENT_DELIMITER.test(text)) {
        const fence = this.#fence(first, { start: first, end });
        nodes.push(this.#blockComment(first, fence));
        line = source.lineOf(fence.end) + 1;
      } else if (LINE_COMMENT.test(text)) {
        const commentEnd = first + raw.trim().length;
        nodes.push(
          createNode<TxtCommentNode>(source, "Comment", first, commentEnd, {
            value: text.slice(2),
          }),
        );
        line++;
      } else if (COMMENT_STYLE.test(text)) {
        const commentLine = this.#nextNonBlankLine(line + 1, end);
        if (commentLine === undefined) {
          line++;
          continue;
        }
        const commentStart = source.lineStart(commentLine);
        const fence = this.#fenceIfAny(commentStart, { start: commentStart, end });
        const comment = fence
          ? this.#blockComment(commentStart, fence)
          : this.#paragraphComment(commentStart, end);
        nodes.push(comment);
        line = source.lineOf(comment.range[1]) + 1;
      } else if (ATTRIBUTE_ENTRY.test(text)) {
        while (
          ATTRIBUTE_CONTINUATION.test(source.lineText(line)) &&
          this.#lineWithin(line + 1, end)
        ) {
          line++;
        }
        line++;
      } else if (NON_CONTENT_LINE.test(text)) {
        line++;
      } else {
        const paragraphEnd = this.#paragraphEnd(first, end);
        const paragraph = this.#paragraph(first, paragraphEnd, { context: "unknown" });
        if (paragraph) {
          nodes.push(paragraph);
        }
        line = source.lineOf(paragraphEnd) + 1;
      }
    }
    return nodes;
  }

  #block(block: SkeletonBlock, region: Region): Built {
    switch (block.kind) {
      case "section":
        return this.#section(block, region);
      case "compound":
        return this.#compound(block, region);
      case "simple":
        return this.#simple(block, region);
      case "list":
        return this.#list(block, region);
      case "dlist":
        return this.#descriptionList(block, region);
      case "table":
        return this.#table(block, region);
    }
  }

  #section(block: SkeletonSection, region: Region): Built {
    const header = this.#header(region, block.level, info(block));
    if (block.context !== "section") {
      return { nodes: [header.node], end: header.end };
    }
    const inner = this.blocks(block.blocks, { start: header.end, end: region.end }, true);
    return { nodes: [header.node, ...inner.nodes], end: inner.end };
  }

  #header(region: Region, level: number, asciidoc: AsciidocInfo): { node: TxtNode; end: number } {
    const source = this.#source;
    const line = source.lineOf(region.start);
    const lineText = source.text.slice(region.start, source.lineEnd(line));

    let titleStart: number;
    let titleEnd: number;
    let end: number;
    const atx = ATX_SECTION_TITLE.exec(lineText);
    if (atx) {
      const [start, stop] = atx.indices![2]!;
      titleStart = region.start + start;
      titleEnd = region.start + stop;
      end = source.lineEnd(line);
    } else {
      // 下線で示す形式（setext）のタイトル。
      titleStart = region.start + lineText.length - lineText.trimStart().length;
      titleEnd = region.start + lineText.trimEnd().length;
      end = this.#lineWithin(line + 1, region.end) ? source.lineEnd(line + 1) : titleEnd;
    }

    const node = createNode<WithAsciidoc<TxtHeaderNode>>(source, "Header", region.start, end, {
      depth: Math.min(level + 1, 6) as TxtHeaderNode["depth"],
      children: parseInline(source, titleStart, titleEnd),
      asciidoc,
    });
    return { node, end };
  }

  #compound(block: SkeletonCompound, region: Region): Built {
    const fence = this.#fenceIfAny(region.start, region);
    const inner = fence
      ? this.blocks(block.blocks, fence.inner, true)
      : this.blocks(block.blocks, region, false);
    const end = fence ? fence.end : inner.end;
    if (end <= region.start) {
      return { nodes: [], end: region.start };
    }
    const children = inner.nodes.map((node) => this.#asBlockContent(node));
    return { nodes: [this.#blockQuote(region.start, end, info(block), children)], end };
  }

  #simple(block: SkeletonSimple, region: Region): Built {
    const source = this.#source;
    const asciidoc = info(block);
    const { context } = block;

    if (context === "thematic_break" || NON_PROSE_CONTEXTS.has(context)) {
      const end = source.lineEnd(source.lineOf(region.start));
      const nodes =
        context === "thematic_break"
          ? [
              createNode<WithAsciidoc<TxtHorizontalRuleNode>>(
                source,
                "HorizontalRule",
                region.start,
                end,
                { asciidoc },
              ),
            ]
          : [];
      return { nodes, end };
    }

    const fence = this.#fenceIfAny(region.start, region);
    const end = fence ? fence.end : this.#paragraphEnd(region.start, region.end);
    const content = fence ? fence.inner : { start: region.start, end };

    if (CODE_CONTEXTS.has(context) || context === "pass") {
      const value = source.text.slice(content.start, this.#trimEnd(content.start, content.end));
      const node =
        context === "pass"
          ? createNode<WithAsciidoc<TxtHtmlNode>>(source, "Html", region.start, end, {
              value,
              asciidoc,
            })
          : createNode<WithAsciidoc<TxtCodeBlockNode>>(source, "CodeBlock", region.start, end, {
              value,
              lang: context === "stem" ? block.style : block.language,
              asciidoc,
            });
      return { nodes: [node], end };
    }

    let proseStart = content.start;
    if (!fence && context === "admonition") {
      const label = ADMONITION_LABEL.exec(source.text.slice(proseStart, end));
      proseStart += label?.[0].length ?? 0;
    }

    if (!QUOTE_LIKE_CONTEXTS.has(context)) {
      const paragraph = this.#paragraph(proseStart, content.end, asciidoc);
      return { nodes: paragraph ? [paragraph] : [], end };
    }
    const paragraph = this.#paragraph(proseStart, content.end);
    return {
      nodes: [this.#blockQuote(region.start, end, asciidoc, paragraph ? [paragraph] : [])],
      end,
    };
  }

  #list(block: SkeletonList, region: Region): Built {
    const marker = LIST_MARKERS[block.context];
    const items = this.#siblings(block.items, region, (item, itemRegion) =>
      this.#listItem(item, itemRegion, marker),
    );
    return this.#listNode(block, items, { ordered: block.context === "olist" });
  }

  #listItem(item: SkeletonListItem, region: Region, marker: RegExp | undefined): Built {
    const source = this.#source;
    const head = source.text.slice(region.start, source.lineEnd(source.lineOf(region.start)));
    const markerMatch = marker?.exec(head);
    const itemStart = region.start + head.length - head.trimStart().length;
    const textStart = markerMatch ? region.start + markerMatch[0].length : itemStart;
    const check = markerMatch?.groups?.["check"];

    const body = this.#itemBody(item, textStart, region);
    const node = createNode<TxtListItemNode>(source, "ListItem", itemStart, body.end, {
      children: body.nodes,
      ...(check !== undefined && { checked: check !== " " }),
    });
    return { nodes: [node], end: body.end };
  }

  /** リスト項目のテキストと、それに続く子ブロック。 */
  #itemBody(item: SkeletonListItem, textStart: number, region: Region): Built {
    const nodes: TxtNode[] = [];
    let end = textStart;

    if (item.hasText) {
      const firstChild = item.blocks[0];
      const textBound = firstChild
        ? Math.min(region.end, Math.max(textStart, this.#source.lineStart(firstChild.line)))
        : region.end;
      end = this.#paragraphEnd(textStart, textBound);
      const paragraph = this.#paragraph(textStart, end);
      if (paragraph) {
        nodes.push(paragraph);
      }
    }

    const inner = this.blocks(item.blocks, { start: end, end: region.end }, false);
    nodes.push(...inner.nodes.map((node) => this.#asBlockContent(node)));
    return { nodes, end: Math.max(end, inner.end) };
  }

  #descriptionList(block: SkeletonDescriptionList, region: Region): Built {
    // 項目の位置は最初の用語の行で決まる。
    const entries = block.entries.flatMap((entry) => {
      const firstTerm = entry.terms[0];
      return firstTerm ? [{ line: firstTerm.line, entry }] : [];
    });
    const items = this.#siblings(entries, region, ({ entry }, entryRegion) =>
      this.#descriptionEntry(entry, entryRegion),
    );
    return this.#listNode(block, items, { ordered: false });
  }

  /** 説明リストの 1 項目（1 つ以上の用語と、その説明）。 */
  #descriptionEntry(entry: SkeletonDescriptionListEntry, region: Region): Built {
    const source = this.#source;
    const nodes: TxtNode[] = [];
    let entryStart: number | undefined;
    let end = region.start;
    // 用語と同じ行に書かれた説明の開始位置。
    let inlineDescription: { line: number; start: number } | undefined;

    for (const term of entry.terms) {
      const termStart = Math.max(region.start, source.lineStart(term.line));
      const match = DESCRIPTION_LIST_TERM.exec(
        source.text.slice(termStart, source.lineEnd(term.line)),
      );
      if (!match) {
        continue;
      }
      const [start, stop] = match.indices![1]!;
      entryStart ??= termStart + start;
      const paragraph = this.#paragraph(termStart + start, termStart + stop);
      if (paragraph) {
        nodes.push(paragraph);
      }
      end = termStart + match[0].length;
      inlineDescription = match.indices![2]
        ? { line: term.line, start: termStart + match.indices![2][0] }
        : undefined;
    }

    // 用語を 1 つも認識できなければ、何も消費しない。その範囲はギャップとして走査される。
    if (entryStart === undefined) {
      return { nodes: [], end: region.start };
    }

    const description = entry.description;
    if (description) {
      let textStart: number;
      if (inlineDescription && inlineDescription.line === description.line) {
        textStart = inlineDescription.start;
      } else {
        const line = source.lineText(description.line);
        textStart = source.lineStart(description.line) + line.length - line.trimStart().length;
      }
      const body = this.#itemBody(description, textStart, { start: textStart, end: region.end });
      nodes.push(...body.nodes);
      end = Math.max(end, body.end);
    }

    const node = createNode<TxtListItemNode>(source, "ListItem", entryStart, end, {
      children: nodes,
    });
    return { nodes: [node], end };
  }

  #listNode(
    block: SkeletonList | SkeletonDescriptionList,
    items: Built,
    props: { ordered: boolean },
  ): Built {
    // List の子は ListItem に限られるので、項目どうしの間にあるコメントなどは直前の項目に含める。
    const children: TxtNode[] = [];
    for (const node of items.nodes) {
      const previous = children.at(-1);
      if (node.type !== "ListItem" && previous?.type === "ListItem") {
        children[children.length - 1] = this.#appendToListItem(
          previous as TxtListItemNode,
          this.#asBlockContent(node),
        );
      } else {
        children.push(node);
      }
    }

    const first = children[0];
    if (!first) {
      return items;
    }
    const node = createNode<WithAsciidoc<TxtListNode>>(
      this.#source,
      "List",
      first.range[0],
      items.end,
      { ...props, children, asciidoc: info(block) },
    );
    return { nodes: [node], end: items.end };
  }

  /** 項目の末尾に子を加え、範囲をその子の終わりまで広げる。 */
  #appendToListItem(item: TxtListItemNode, child: TxtNode): TxtListItemNode {
    return createNode<TxtListItemNode>(this.#source, "ListItem", item.range[0], child.range[1], {
      children: [...item.children, child],
      ...(item.checked != null && { checked: item.checked }),
    });
  }

  /**
   * ブロック要素だけを子に持てる位置（BlockQuote、ListItem、asciidoc スタイルの TableCell）に
   * 置くノードに変換する。
   *
   * Comment はインライン要素なので、それだけを含む Paragraph で包む。
   */
  #asBlockContent(node: TxtNode): TxtNode {
    if (node.type !== "Comment") {
      return node;
    }
    return createNode<WithAsciidoc<TxtParagraphNode>>(
      this.#source,
      "Paragraph",
      node.range[0],
      node.range[1],
      { children: [node], asciidoc: { context: "comment" } },
    );
  }

  /**
   * 兄弟要素を順に組み立てる。
   *
   * 各要素の範囲の上限は次の兄弟の開始行で、要素どうしの間はギャップとして走査する。
   */
  #siblings<T extends { readonly line: number }>(
    items: readonly T[],
    region: Region,
    build: (item: T, region: Region) => Built,
  ): Built {
    const nodes: TxtNode[] = [];
    let cursor = region.start;

    items.forEach((item, i) => {
      const itemRegion = this.#childRegion(item.line, items[i + 1]?.line, region);
      if (!itemRegion) {
        return;
      }
      nodes.push(...this.gap(cursor, itemRegion.start));
      const built = build(item, itemRegion);
      nodes.push(...built.nodes);
      cursor = Math.max(cursor, built.end);
    });

    return { nodes, end: cursor };
  }

  #table(block: SkeletonTable, region: Region): Built {
    const source = this.#source;
    const fence = this.#fenceIfAny(region.start, region);
    if (!fence) {
      return { nodes: [], end: region.start };
    }

    const sourceCells = splitTableCells(
      source,
      fence.inner.start,
      fence.inner.end,
      block.format,
      block.separator,
    );
    const rows = this.#pairTableCells(block, sourceCells) ?? this.#unparsedTableRows(fence.inner);

    const node = createNode<WithAsciidoc<TxtTableNode>>(source, "Table", region.start, fence.end, {
      children: rows,
      asciidoc: info(block),
    });
    return { nodes: [node], end: fence.end };
  }

  /**
   * Asciidoctor が認識したセルと、元のテキストから切り出したセルを先頭から対応付ける。
   *
   * 数が合わなければ対応付けを諦めて undefined を返す。
   */
  #pairTableCells(block: SkeletonTable, sourceCells: SourceCell[]): TxtTableRowNode[] | undefined {
    const source = this.#source;
    const rows: TxtTableRowNode[] = [];
    let index = 0;
    let remaining = 0;

    for (const row of block.rows) {
      const cells: TxtTableCellNode[] = [];
      let rowStart: number | undefined;
      let rowEnd = 0;
      for (const cell of row.cells) {
        if (remaining > 0) {
          // `n*` で複製されたセル。元のテキストは最初のセルと同じなので出力しない。
          remaining--;
          continue;
        }
        const sourceCell = sourceCells[index++];
        if (!sourceCell) {
          return undefined;
        }
        remaining = sourceCell.repeat - 1;
        rowStart ??= sourceCell.start;
        rowEnd = sourceCell.end;
        cells.push(this.#tableCell(cell, sourceCell));
      }
      if (rowStart !== undefined) {
        rows.push(
          createNode<TxtTableRowNode>(source, "TableRow", rowStart, rowEnd, { children: cells }),
        );
      }
    }

    return index === sourceCells.length && remaining === 0 ? rows : undefined;
  }

  #tableCell(cell: SkeletonTableCell, sourceCell: SourceCell): TxtTableCellNode {
    const { contentStart: start, contentEnd: end } = sourceCell;
    let children: TxtNode[];
    if (cell.blocks) {
      // asciidoc スタイルのセルの中身はブロックの並びなので、ブロック要素を子に持つ。
      children = this.blocks(cell.blocks, { start, end }, true).nodes.map((node) =>
        this.#asBlockContent(node),
      );
    } else if (cell.style === "literal") {
      // literal スタイルのセルは literal ブロックと同じく書式を解釈しないので、中身全体を 1 つのコードとする。
      children =
        start < end
          ? [
              createNode<TxtCodeNode>(this.#source, "Code", start, end, {
                value: this.#source.text.slice(start, end),
              }),
            ]
          : [];
    } else {
      children = this.#inline(start, end);
    }
    return createNode<TxtTableCellNode>(this.#source, "TableCell", start, end, { children });
  }

  /** セルを対応付けられなかった表は、中身全体を 1 つのセルとして扱う。 */
  #unparsedTableRows(inner: Region): TxtTableRowNode[] {
    const source = this.#source;
    const start = this.#trimStart(inner.start, inner.end);
    const end = this.#trimEnd(start, inner.end);
    if (start >= end) {
      return [];
    }
    const cell = createNode<TxtTableCellNode>(source, "TableCell", start, end, {
      children: this.#inline(start, end),
    });
    return [createNode<TxtTableRowNode>(source, "TableRow", start, end, { children: [cell] })];
  }

  #blockQuote(start: number, end: number, asciidoc: AsciidocInfo, children: TxtNode[]): TxtNode {
    return createNode<WithAsciidoc<TxtBlockQuoteNode>>(this.#source, "BlockQuote", start, end, {
      children,
      asciidoc,
    });
  }

  /** 前後の空白を除いた範囲を段落にする。空なら undefined。 */
  #paragraph(start: number, end: number, asciidoc?: AsciidocInfo): TxtNode | undefined {
    const trimmedStart = this.#trimStart(start, end);
    const trimmedEnd = this.#trimEnd(trimmedStart, end);
    if (trimmedStart >= trimmedEnd) {
      return undefined;
    }
    return createNode<MaybeWithAsciidoc<TxtParagraphNode>>(
      this.#source,
      "Paragraph",
      trimmedStart,
      trimmedEnd,
      {
        children: this.#inline(trimmedStart, trimmedEnd),
        ...(asciidoc && { asciidoc }),
      },
    );
  }

  /** インライン記法を解析する。行コメントは Comment として切り出す。 */
  #inline(start: number, end: number): TxtNode[] {
    const source = this.#source;
    const nodes: TxtNode[] = [];
    let segmentStart = start;

    for (let line = source.lineOf(start); this.#lineWithin(line, end); line++) {
      const lineStart = source.lineStart(line);
      if (lineStart < start || !LINE_COMMENT.test(source.lineText(line))) {
        continue;
      }
      const commentEnd = Math.min(end, this.#trimEnd(lineStart, source.lineEnd(line)));
      const segmentEnd = this.#trimEnd(segmentStart, lineStart);
      if (segmentStart < segmentEnd) {
        nodes.push(...parseInline(source, segmentStart, segmentEnd));
      }
      nodes.push(
        createNode<TxtCommentNode>(source, "Comment", lineStart, commentEnd, {
          value: source.text.slice(lineStart + 2, commentEnd),
        }),
      );
      segmentStart = this.#trimStart(commentEnd, end);
    }

    if (segmentStart < end) {
      nodes.push(...parseInline(source, segmentStart, end));
    }
    return nodes;
  }

  #blockComment(start: number, fence: Fence): TxtNode {
    const source = this.#source;
    return createNode<TxtCommentNode>(source, "Comment", start, fence.end, {
      value: source.text.slice(
        fence.inner.start,
        this.#trimEnd(fence.inner.start, fence.inner.end),
      ),
    });
  }

  #paragraphComment(start: number, bound: number): TxtNode {
    const end = this.#paragraphEnd(start, bound);
    return createNode<TxtCommentNode>(this.#source, "Comment", start, end, {
      value: this.#source.text.slice(start, end),
    });
  }

  /** `start` の行が区切り線なら、閉じ区切り線までを返す。 */
  #fenceIfAny(start: number, region: Region): Fence | undefined {
    const source = this.#source;
    const line = source.lineOf(start);
    const closer = closingDelimiter(source.text.slice(start, source.lineEnd(line)));
    return closer === undefined ? undefined : this.#fence(start, region, closer);
  }

  #fence(start: number, region: Region, closer?: string): Fence {
    const source = this.#source;
    const openLine = source.lineOf(start);
    const expected = closer ?? source.text.slice(start, source.lineEnd(openLine)).trim();
    const innerStart = this.#lineWithin(openLine + 1, region.end)
      ? source.lineStart(openLine + 1)
      : source.lineEnd(openLine);

    for (let line = openLine + 1; this.#lineWithin(line, region.end); line++) {
      if (source.lineText(line).trimEnd() === expected) {
        return {
          inner: { start: innerStart, end: source.lineStart(line) },
          end: source.lineEnd(line),
        };
      }
    }
    // 閉じていない区切り線。範囲の終わりまでを中身とする。
    const end = Math.max(innerStart, this.#trimEnd(innerStart, region.end));
    return { inner: { start: innerStart, end }, end };
  }

  /**
   * `start` から空行の手前までの段落の終わり。`bound` は越えない。
   *
   * リストの継続記号 `+` だけの行や、プリプロセッサ ディレクティブの行の手前でも止まる。
   */
  #paragraphEnd(start: number, bound: number): number {
    const source = this.#source;
    let last = source.lineOf(start);
    for (let line = last + 1; this.#lineWithin(line, bound); line++) {
      const text = source.lineText(line).trim();
      if (text === "" || text === "+" || PREPROCESSOR_DIRECTIVE.test(text)) {
        break;
      }
      last = line;
    }
    return this.#trimEnd(start, Math.min(source.lineEnd(last), bound));
  }

  /** 子ブロックの範囲。開始行が親の範囲の外なら undefined。 */
  #childRegion(line: number, nextLine: number | undefined, parent: Region): Region | undefined {
    const source = this.#source;
    const start = Math.max(parent.start, source.lineStart(line));
    if (start >= parent.end) {
      return undefined;
    }
    const end =
      nextLine === undefined
        ? parent.end
        : Math.min(parent.end, Math.max(start, source.lineStart(nextLine)));
    return { start, end };
  }

  #nextNonBlankLine(from: number, bound: number): number | undefined {
    for (let line = from; this.#lineWithin(line, bound); line++) {
      if (!this.#source.isBlankLine(line)) {
        return line;
      }
    }
    return undefined;
  }

  /** 行が存在し、その先頭が `bound` より前にあるか。 */
  #lineWithin(line: number, bound: number): boolean {
    return line <= this.#source.lineCount && this.#source.lineStart(line) < bound;
  }

  #trimStart(start: number, end: number): number {
    const text = this.#source.text;
    while (start < end && /\s/u.test(text[start]!)) {
      start++;
    }
    return start;
  }

  #trimEnd(start: number, end: number): number {
    const text = this.#source.text;
    while (end > start && /\s/u.test(text[end - 1]!)) {
      end--;
    }
    return end;
  }
}

function info(block: SkeletonBlock): AsciidocInfo {
  return block.style === undefined
    ? { context: block.context }
    : { context: block.context, style: block.style };
}

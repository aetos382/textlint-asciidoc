import type {
  TxtBreakNode,
  TxtCodeNode,
  TxtEmphasisNode,
  TxtLinkNode,
  TxtNode,
  TxtStrNode,
  TxtStrongNode,
} from "@textlint/ast-node-types";

import { createNode } from "../ast/node.js";
import type { SourceText } from "../text/SourceText.js";

/**
 * - `text`: 記法として解釈するが、ノードは作らずに Str に含めるもの
 *   （エスケープ、パススルー、画像や脚注などのマクロ、属性参照）。
 *   中身を他の記法として解釈させないために使う。
 */
type RuleKind = "text" | "code" | "link" | "url" | "strong" | "emphasis" | "break";

interface Rule {
  readonly kind: RuleKind;
  readonly pattern: RegExp;
}

// Asciidoctor の CC_WORD に相当する文字クラス。日本語の文字も単語構成文字に含まれる。
const WORD = String.raw`\p{L}\p{M}\p{N}_`;
// 書式記号の直前に置けるロール指定（`[.role]*text*` など）。
const ROLE = String.raw`(?:\[[^\[\]\r\n]*\])?`;

/** 単語の境界でだけ効く記法（`*text*` など）。Asciidoctor の QUOTE_SUBS と同じ条件にする。 */
function constrained(mark: string, extra = ""): RegExp {
  return new RegExp(
    String.raw`(?<![${WORD};:}${extra}])${ROLE}${mark}(\S|\S[\s\S]*?\S)${mark}(?![${WORD}${extra}])`,
    "dgu",
  );
}

/** 単語の途中でも効く記法（`**text**` など）。 */
function unconstrained(mark: string): RegExp {
  return new RegExp(String.raw`${ROLE}${mark}([\s\S]+?)${mark}`, "dgu");
}

const MACRO_NAMES =
  "image|footnote|footnoteref|xref|kbd|btn|menu|stem|latexmath|asciimath|pass|indexterm2?|anchor|icon";
const BRACKETED = String.raw`\[((?:\\\]|[^\]])*)\]`;

/** 同じ位置から始まる場合は、先に並んでいる規則を優先する。 */
const RULES: readonly Rule[] = [
  {
    kind: "text",
    pattern: new RegExp(
      String.raw`\\(?:\*\*|__|\x60\x60|\+\+\+|\+\+|[*_\x60+#^~{\[<]|(?:https?|ftp|irc|mailto|link|${MACRO_NAMES}):)`,
      "dgu",
    ),
  },
  { kind: "text", pattern: /\+\+\+[\s\S]*?\+\+\+|\+\+[\s\S]+?\+\+/dgu },
  { kind: "text", pattern: constrained(String.raw`\+`) },
  { kind: "code", pattern: unconstrained("``") },
  { kind: "code", pattern: constrained("`", String.raw`"'\x60`) },
  {
    kind: "text",
    pattern: new RegExp(
      [
        String.raw`(?<![${WORD}])(?:${MACRO_NAMES}):[^\s\[]*${BRACKETED}`,
        String.raw`<<[^>\r\n]+>>`,
        String.raw`\(\(\([\s\S]*?\)\)\)`,
        String.raw`\(\([\s\S]*?\)\)`,
        String.raw`\[\[[^\[\]\r\n]+\]\]`,
        String.raw`\{[\p{L}\p{N}_][\p{L}\p{N}_-]*(?::[^}\r\n]*)?\}`,
      ].join("|"),
      "dgu",
    ),
  },
  {
    kind: "link",
    pattern: new RegExp(String.raw`(?<![${WORD}])(?:link|mailto):([^\s\[]+)${BRACKETED}`, "dgu"),
  },
  {
    kind: "url",
    pattern: new RegExp(
      String.raw`(?<![${WORD}/"'=])(?:https?|ftp|irc)://[^\s\[\]<>"]+(?:${BRACKETED})?`,
      "dgu",
    ),
  },
  { kind: "strong", pattern: unconstrained(String.raw`\*\*`) },
  { kind: "strong", pattern: constrained(String.raw`\*`) },
  { kind: "emphasis", pattern: unconstrained("__") },
  { kind: "emphasis", pattern: constrained("_") },
  { kind: "break", pattern: /[ \t]\+(?=\r\n|\r|\n|$)/dgu },
];

// ラベルのない URL の末尾にある句読点は URL に含めない。
const URL_TRAILING_PUNCTUATION = /[.,;:!?)]+$/u;

/**
 * `[start, end)` の範囲をインライン記法として解析する。
 *
 * 返すノードは範囲を隙間なく覆う。記法として認識しなかった部分はすべて Str になる。
 */
export function parseInline(source: SourceText, start: number, end: number): TxtNode[] {
  const text = source.text.slice(start, end);
  const nodes: TxtNode[] = [];

  // 各規則について、最後に見つけたマッチを覚えておき、走査位置を越えるまで使い回す。
  const found: (RegExpExecArray | null | undefined)[] = [];
  let strStart = 0;
  let position = 0;

  const flushStr = (until: number): void => {
    if (strStart < until) {
      const raw = text.slice(strStart, until);
      nodes.push(
        createNode<TxtStrNode>(source, "Str", start + strStart, start + until, { value: raw }),
      );
    }
  };

  while (position < text.length) {
    let bestRule: Rule | undefined;
    let best: RegExpExecArray | undefined;
    RULES.forEach((rule, i) => {
      let match = found[i];
      if (match === undefined || (match !== null && match.index < position)) {
        rule.pattern.lastIndex = position;
        match = rule.pattern.exec(text);
        found[i] = match;
      }
      if (match && (!best || match.index < best.index)) {
        best = match;
        bestRule = rule;
      }
    });

    if (!best || !bestRule) {
      break;
    }

    let matchEnd = best.index + best[0].length;
    if (bestRule.kind === "text") {
      position = matchEnd;
      continue;
    }

    if (bestRule.kind === "url" && best[1] === undefined) {
      matchEnd -= URL_TRAILING_PUNCTUATION.exec(best[0])?.[0].length ?? 0;
    }

    flushStr(best.index);
    nodes.push(createInlineNode(source, bestRule.kind, best, start, matchEnd));
    position = matchEnd;
    strStart = matchEnd;
  }

  flushStr(text.length);
  return nodes;
}

function createInlineNode(
  source: SourceText,
  kind: Exclude<RuleKind, "text">,
  match: RegExpExecArray,
  base: number,
  matchEnd: number,
): TxtNode {
  const start = base + match.index;
  const end = base + matchEnd;
  const group = (index: number): [number, number] => {
    const [groupStart, groupEnd] = match.indices![index]!;
    return [base + groupStart, base + groupEnd];
  };

  switch (kind) {
    case "code": {
      const value = match[1]!;
      // `` `+text+` `` は中身をそのまま表示するモノスペース。
      const literal = /^\+([\s\S]*)\+$/u.exec(value);
      return createNode<TxtCodeNode>(source, "Code", start, end, {
        value: literal ? literal[1]! : value,
      });
    }

    case "strong":
    case "emphasis": {
      const [innerStart, innerEnd] = group(1);
      return createNode<TxtStrongNode | TxtEmphasisNode>(
        source,
        kind === "strong" ? "Strong" : "Emphasis",
        start,
        end,
        { children: parseInline(source, innerStart, innerEnd) },
      );
    }

    case "link":
    case "url": {
      const labelGroup = kind === "link" ? 2 : 1;
      const label = match[labelGroup] !== undefined ? group(labelGroup) : undefined;
      // ラベル付きの URL は `[` の直前までが URL。
      const [urlStart, urlEnd] = kind === "link" ? group(1) : [start, label ? label[0] - 1 : end];
      const target = source.text.slice(urlStart, urlEnd);
      const url = match[0].startsWith("mailto:") ? `mailto:${target}` : target;
      const children =
        label && source.text.slice(...label).trim() !== ""
          ? parseInline(source, ...label)
          : [createNode<TxtStrNode>(source, "Str", urlStart, urlEnd, { value: target })];
      return createNode<TxtLinkNode>(source, "Link", start, end, { url, children });
    }

    case "break":
      return createNode<TxtBreakNode>(source, "Break", start, end, {});
  }
}

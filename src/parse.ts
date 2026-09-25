import type { TxtDocumentNode } from "@textlint/ast-node-types";

import { buildDocument } from "./ast/buildDocument.js";
import { parseAsciidoc, type ParseOptions } from "./parser/asciidoctor.js";
import { SourceText } from "./text/SourceText.js";

export type { ParseOptions };

/** AsciiDoc のテキストを textlint の AST に変換する。 */
export async function parse(text: string, options: ParseOptions = {}): Promise<TxtDocumentNode> {
  const skeleton = await parseAsciidoc(text, options);
  return buildDocument(new SourceText(text), skeleton);
}

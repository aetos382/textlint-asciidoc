import type {
  TextlintMessage,
  TextlintPluginOptions,
  TextlintPluginPostProcessResult,
  TextlintPluginProcessor,
} from "@textlint/types";

import { parse } from "./parse.js";

export interface AsciidocPluginOptions {
  /** 既定の拡張子に加えて、AsciiDoc として扱うファイルの拡張子。 */
  readonly extensions?: readonly string[];
  /** Asciidoctor に渡すドキュメント属性。`ifdef` の判定などに影響する。 */
  readonly attributes?: Readonly<Record<string, string>>;
}

const DEFAULT_EXTENSIONS = [".adoc", ".asciidoc", ".asc"];

export class AsciidocProcessor implements TextlintPluginProcessor {
  readonly #options: AsciidocPluginOptions;

  constructor(options: TextlintPluginOptions = {}) {
    this.#options = validateOptions(options);
  }

  availableExtensions(): string[] {
    return [...DEFAULT_EXTENSIONS, ...(this.#options.extensions ?? [])];
  }

  processor() {
    return {
      preProcess: (text: string) => parse(text, { attributes: this.#options.attributes }),
      postProcess: (
        messages: TextlintMessage[],
        filePath?: string,
      ): TextlintPluginPostProcessResult => ({
        messages,
        filePath: filePath ?? "<asciidoc>",
      }),
    };
  }
}

function validateOptions(options: TextlintPluginOptions): AsciidocPluginOptions {
  const { extensions, attributes } = options;

  if (
    extensions !== undefined &&
    !(Array.isArray(extensions) && extensions.every((e) => typeof e === "string"))
  ) {
    throw new TypeError("textlint-plugin-asciidoc: `extensions` must be an array of strings.");
  }

  if (
    attributes !== undefined &&
    !(
      typeof attributes === "object" &&
      attributes !== null &&
      !Array.isArray(attributes) &&
      Object.values(attributes).every((value) => typeof value === "string")
    )
  ) {
    throw new TypeError(
      "textlint-plugin-asciidoc: `attributes` must be an object whose values are strings.",
    );
  }

  return {
    extensions,
    attributes: attributes as Record<string, string> | undefined,
  };
}

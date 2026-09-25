import type { TextlintPluginCreator } from "@textlint/types";

import { AsciidocProcessor } from "./AsciidocProcessor.js";

export type { AsciidocPluginOptions } from "./AsciidocProcessor.js";
export type { AsciidocInfo } from "./ast/node.js";
export { parse, type ParseOptions } from "./parse.js";

const plugin: TextlintPluginCreator = { Processor: AsciidocProcessor };

export default plugin;

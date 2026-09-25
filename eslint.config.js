import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist/", "temp/", "test/fixtures/"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/parser/asciidoctor.ts"],
    rules: {
      // パーサへの依存を src/parser/asciidoctor.ts に閉じ込め、パーサを差し替えられるようにしておく。
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@asciidoctor/core",
              message: "Only src/parser/asciidoctor.ts may depend on Asciidoctor.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);

# CLAUDE.md

## コマンド

- `npm run typecheck` / `npm run lint` / `npm test` / `npm run build`: CI（`.github/workflows/ci.yml`）はこの順で実行する。まとめて確認するときは `verify` スキルを使う。
- 特定のテストだけを実行する: `npx vitest run test/processor.test.ts -t "<テスト名>"`
- `npm run lint` は ESLint に加えて `prettier --check` も実行する。pre-commit hook（`.gitconfig` の Config-based hooks）でも Prettier の整形を確認しているので、失敗したら `npm run format` を実行して再ステージする。
- TypeScript は 6.0 系に留めている（typescript-eslint が `<6.1` までしか対応しないため）。Renovate の `allowedVersions` で 6.1 以上に上がらないようにしている（`renovate.json`）。Vitest 5 は Node.js 22.12 以上が必要で、`engines` もこれに合わせている。

## 構成

AsciiDoc を textlint の AST に変換する処理（`src/parse.ts`）は、次の 3 つの層に分かれている。

1. `src/parser/asciidoctor.ts`: Asciidoctor.js でパースし、`src/parser/skeleton.ts` の型（ブロックの種類と開始行だけを持ち、範囲は持たない）に写す。`@asciidoctor/core` を import してよいのはこのファイルだけ。
2. `src/ast/buildDocument.ts`: skeleton と元のテキスト（`src/text/SourceText.ts`）から、各ノードの範囲を求めて AST を組み立てる。
3. `src/inline/parseInline.ts`: インライン記法を独自の正規表現で解析する。Asciidoctor の規則を簡略化したもの。

全ノードは `raw` が元のテキストの `range` の部分と一致し、子ノードは互いに重ならないように並ぶ。テスト（`test/helpers/invariants.ts`）でこれを検証している。

Asciidoctor の挙動は `node_modules/@asciidoctor/core/src/`（JavaScript で書かれたソース）で確認できる。sourcemap で得られるのはブロックの開始行だけで、コメント行と偽の `ifdef` の中身は構文木に現れない。

`BlockQuote`、`ListItem`、asciidoc スタイルの `TableCell` の子になるコメントは `Paragraph`（`asciidoc.context: "comment"`）で包み、`List` の項目の間のコメントは直前の `ListItem` に含める。`assertContentModel` で検証している。

AST の対応付けや制限事項を変えたときは、README の「AST」節と「制限事項」節も更新する。

## スナップショット

`test/fixtures/*/output.json` は `npm run update-snapshot` で生成する機械生成物であり、手で書かない。スナップショットが食い違ったとき、実装の変更で AST が変わるとき、fixture を追加したときは、`update-snapshot` スキルの手順に従う。

`.gitattributes` の `eol=lf` により、CRLF の fixture はコミットすると LF に変わる。CRLF と CR は `test/fixtures.test.ts` が各 fixture を変換して検証しているので、CRLF の fixture は追加しない。

textlint のメッセージの `loc` の桁は 1 始まりで、AST ノードの `loc` の桁（0 始まり）とは異なる。

使い捨ての実験は `temp/`（gitignore 済み）に置く。`vitest.config.ts` は `test/` だけを対象にしているので、`temp/` に置いたテストは既定では実行されない。

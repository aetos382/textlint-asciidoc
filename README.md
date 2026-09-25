# @aetos382/textlint-plugin-asciidoc

[textlint](https://textlint.org/) で AsciiDoc の文書を検査するためのプラグインです。

AsciiDoc の解析には [Asciidoctor.js](https://github.com/asciidoctor/asciidoctor.js) を使います。各ノードの位置は元のテキストから求めるので、指摘は元のファイル上の正確な位置に表示されます。

## インストール

```sh
npm install --save-dev textlint @aetos382/textlint-plugin-asciidoc
```

Node.js 22.12 以降と textlint 15 以降が必要です。

## 使い方

`.textlintrc.json` にプラグインを追加します。

```json
{
  "plugins": {
    "@aetos382/asciidoc": true
  }
}
```

既定では `.adoc`、`.asciidoc`、`.asc` の拡張子のファイルを検査します。

### オプション

```json
{
  "plugins": {
    "@aetos382/asciidoc": {
      "extensions": [".txt"],
      "attributes": {
        "product-name": "Example"
      }
    }
  }
}
```

| オプション   | 型                       | 説明                                              |
| ------------ | ------------------------ | ------------------------------------------------- |
| `extensions` | `string[]`               | 既定の拡張子に加えて、AsciiDoc として扱う拡張子。 |
| `attributes` | `Record<string, string>` | Asciidoctor に渡すドキュメント属性。              |

## AST

AsciiDoc の各要素は、textlint の標準のノード型に次のように対応付けます。

| AsciiDoc                                                      | ノード型                         |
| ------------------------------------------------------------- | -------------------------------- |
| ドキュメント タイトル、節タイトル、独立した見出し             | `Header`                         |
| 段落                                                          | `Paragraph`                      |
| 箇条書き、番号付きリスト、コールアウト リスト、説明リスト     | `List`、`ListItem`               |
| 注記、サイドバー、例、オープン ブロック、引用、詩             | `BlockQuote`                     |
| リスティング、リテラル、ソース コード、数式ブロック           | `CodeBlock`                      |
| パススルー ブロック                                           | `Html`                           |
| 表                                                            | `Table`、`TableRow`、`TableCell` |
| 区切り線                                                      | `HorizontalRule`                 |
| 行コメント、コメント ブロック、`[comment]` スタイルのブロック | `Comment`                        |
| 強調（`*`、`**`）、斜体（`_`、`__`）、等幅（`` ` ``、` `` `） | `Strong`、`Emphasis`、`Code`     |
| URL、`link:` マクロ、`mailto:` マクロ                         | `Link`                           |
| 強制改行（行末の ` +`）                                       | `Break`                          |
| literal スタイル（`l`）の表セルの中身                         | `Code`                           |

Asciidoctor のブロックから作ったノードには、元のブロックの種類を示す `asciidoc` プロパティが付きます。たとえば注記は `{ "type": "BlockQuote", "asciidoc": { "context": "admonition", "style": "NOTE" } }` になります。ルールの中で AsciiDoc の種類を区別したいときに使えます。

`Comment` はインライン要素なので、ブロック要素だけを子に持つ `BlockQuote` と `ListItem` の中のコメントは、そのコメントだけを含む `Paragraph`（`asciidoc: { context: "comment" }`）で包みます。リストの項目と項目の間にあるコメントは、同じく包んだうえで直前の `ListItem` に含めます。

### 文書の扱い

- `include::` ディレクティブは展開しません。取り込まれるファイルは、それぞれ単独で検査してください。
- `ifdef::`、`ifndef::`、`ifeval::` の中身は、条件にかかわらずすべて検査します。
- 属性参照（`{name}`）は展開せず、書かれたとおりの文字列として検査します。
- 画像、脚注、相互参照などのマクロは、書かれたとおりの文字列として `Str` に含めます。

## 制限事項

- ブロック タイトル（`.Title`）は検査しません。
- 1 行形式の条件ディレクティブ（`ifdef::name[text]`）の中の文字列は検査しません。
- 表の最初のセルより前に書いたコメント行は、どのセルにも属さないので `Comment` ノードになりません。
- asciidoc スタイル（`a`）の表セルの中身はブロックの並びなので、その `TableCell` は `Paragraph` や `List` などのブロック ノードを子に持ちます。`@textlint/ast-node-types` の型定義では `TableCell` の子はインライン要素に限られていますが、構造を正確に表すためにこの形にしています。セルの中のコメントは、`BlockQuote` などと同じく `Paragraph` で包みます。
- インライン記法の解析は Asciidoctor の規則を簡略化したものです。入れ子の組み合わせによっては、Asciidoctor の解釈と異なる場合があります。

## ライセンス

MIT

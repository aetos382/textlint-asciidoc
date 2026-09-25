# CLAUDE.md

## スナップショット

`test/fixtures/*/output.json` は `npm run update-snapshot` で生成する機械生成物であり、手で書かない。スナップショットが食い違ったとき、実装の変更で AST が変わるとき、fixture を追加したときは、`update-snapshot` スキルの手順に従う。

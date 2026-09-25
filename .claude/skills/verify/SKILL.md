---
name: verify
description: CI と同じ手順（型検査、lint、テスト、ビルド）を手元で実行し、結果を報告する。
disable-model-invocation: true
allowed-tools: Bash(npm run typecheck), Bash(npm run lint), Bash(npm test), Bash(npm run build)
---

# verify

`.github/workflows/ci.yml` と同じ確認を、同じ順序で実行する。

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run build`

## 進め方

- 途中で失敗しても止めずに、4 つすべてを実行する。失敗が 1 つとは限らず、まとめて把握したほうが直しやすいため。
- 最後に、各手順の成否を一覧にして報告する。失敗した手順については、エラー出力の要点（ファイル、行、メッセージ）を示す。
- 失敗を見つけても、修正は始めない。直すかどうかはユーザーが判断する。
- `npm test` でスナップショット（`test/fixtures/*/output.json`）が一致しなかった場合も、`npm run update-snapshot` を勝手に実行しない。差分を示して、実装の誤りなのか期待値の更新が必要なのかの判断をユーザーに委ねる。

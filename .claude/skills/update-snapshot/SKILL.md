---
name: update-snapshot
description: fixture のスナップショット（test/fixtures/*/output.json）を更新する手順。npm test でスナップショットが食い違ったとき、実装の変更で AST が変わるとき、fixture を追加したときに使う。
---

# update-snapshot

`output.json` は機械生成物であり、手で書かない（`.claude/settings.json` で編集を禁止している）。中身を頭から読むこともしない。意図の確認は個別のテストで行い、スナップショットの差分は範囲と量だけを機械的に確かめる。差分を読むのは、それでも確かめきれない場合に限る。

## 手順

### 1. 予測を書き出す

`npm run update-snapshot` を実行する前に、次の 2 点をユーザーへの応答として明記する。後から差分を見て「意図どおり」と解釈するのを防ぐため、必ず更新より先に書く。

- AST がどう変わるはずか（どの構文が、どのノード型・プロパティ・範囲になるか）。
- 差分が出るはずの fixture の一覧。

AST が変わる意図がないのにスナップショットが食い違っているなら、それは実装の誤りである。このスキルを続けず、ユーザーに報告する。

### 2. 意図をテストにする

予測した変化を確かめる個別のアサーションがなければ、追加する。ユーザーの許可は不要。

- 既存のテストのうち、対象の層に合うファイルに追加する。textlint を通した振る舞いなら `test/processor.test.ts`、パーサを介さない AST の組み立てなら `test/buildDocument.test.ts`。
- どちらにも合わなければ、`src/parse.ts` の `parse()` の結果を `toMatchObject` で確かめるテストを `test/parse.test.ts` に作る。
- テストの概要コメントには、何を確認・保証したいのかを書く（既存のテストに倣う）。
- 追加したテストが通ることを確認する。通らなければ実装か予測の誤りなので、先に進まない。

### 3. 更新して範囲を確かめる

```bash
rm -rf temp/snapshot-baseline && mkdir -p temp && cp -r test/fixtures temp/snapshot-baseline
npm run update-snapshot
git diff --no-index --numstat temp/snapshot-baseline test/fixtures
```

- `npm run update-snapshot` でテストが失敗したら、そこで止めてユーザーに報告する。スナップショット以外の検査（`assertInvariants` など）に違反している。
- `--numstat` に出た fixture を、手順 1 の一覧と比べる。予測にない fixture が変わっていたら、そこで止めてユーザーに報告する。

### 4. 差分を確かめる

`--numstat` の追加行数と削除行数の合計で分ける。

- **200 行以下**: `git diff --no-index temp/snapshot-baseline test/fixtures` をメインで読み、手順 1 の予測と合わない変化がないかを確かめる。
- **200 行超**: `snapshot-reviewer` エージェントに任せる。手順 1 の予測と、差分の出た fixture の一覧を渡す。

予測と合わない変化があれば、ユーザーに報告する。スナップショットを元に戻すかどうかはユーザーが判断する。

### 5. 後始末

`temp/snapshot-baseline` を削除する。

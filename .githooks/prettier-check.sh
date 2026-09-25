#!/usr/bin/env bash
# ステージされた内容が Prettier で整形済みかを確認する。
#
# 作業ツリーではなくインデックス上の内容を検査するため、git show ":<path>" の結果を標準入力で渡す。
# 部分的にステージした変更を書き換えないよう、整形はせず確認だけに留める。
#
# .prettierignore の対象や Prettier の知らない種類のファイルでも、--stdin-filepath と
# --ignore-unknown により終了コードは 0 になる。ただし前者は入力をそのまま標準出力に書き出し、
# 後者は終了コードが 0 でも [error] を出力するので、出力は失敗したときだけ表示する。
set -euo pipefail

prettier='node_modules/.bin/prettier'
if [ ! -x "$prettier" ]; then
  echo 'Prettier is not installed. Run "npm ci" first.' >&2
  exit 1
fi

failed=()
while IFS= read -r -d '' path; do
  if ! output="$(git show ":$path" | "$prettier" --check --ignore-unknown --stdin-filepath "$path" 2>&1 >/dev/null)"; then
    failed+=("$path")
    if [ -n "$output" ]; then
      echo "$output" >&2
    fi
  fi
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [ "${#failed[@]}" -gt 0 ]; then
  echo 'The following staged files are not formatted with Prettier:' >&2
  printf '  %s\n' "${failed[@]}" >&2
  echo 'Run "npm run format" and stage the changes.' >&2
  exit 1
fi

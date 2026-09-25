#!/usr/bin/env bash
# renovate.json がコミットに含まれるとき、renovate-config-validator で検証する。
set -euo pipefail

if ! git diff --cached --name-only --diff-filter=ACMR -- renovate.json | grep -q .; then
  exit 0
fi

# 作業ツリーではなくステージされた内容を検証する。validator は引数なしだと
# カレント ディレクトリの renovate.json を repo config として検証するので、
# 一時ディレクトリに同じ名前で書き出してそこで実行する。
# （ファイル名を引数で渡すと global config として検証されてしまう。）
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
git show ':renovate.json' > "$tmp_dir/renovate.json"

# devcontainer では update-content.sh でグローバルに入れてある。ない環境では npx で取得する。
if command -v renovate-config-validator >/dev/null 2>&1; then
  validator=(renovate-config-validator)
else
  validator=(npx --yes --package renovate -- renovate-config-validator)
fi

# Codespaces（CODESPACES=true）では Renovate がリポジトリ名を stdin で尋ねて止まるので、
# その処理を無効にしたうえで、念のため stdin も閉じる。
(cd "$tmp_dir" && CODESPACES=false "${validator[@]}" --strict < /dev/null)

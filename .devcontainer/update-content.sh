#!/usr/bin/env bash
# 開発ツールの導入。
# - ShellCheck: シェル スクリプトの静的解析に使う。
# postCreateCommand ではなく updateContentCommand で入れるのは、Codespaces の
# prebuild にこの結果を含めるため。
set -euo pipefail

bash "$(dirname "$0")/install-shellcheck.sh"

npm install -g typescript-language-server

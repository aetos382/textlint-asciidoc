#!/usr/bin/env bash
# 開発ツールの導入。
# - ShellCheck: シェル スクリプトの静的解析に使う。
# - Renovate: pre-commit hook で renovate.json を renovate-config-validator で検証するのに使う。
# postCreateCommand ではなく updateContentCommand で入れるのは、Codespaces の
# prebuild にこの結果を含めるため。
set -euo pipefail

# renovate: datasource=npm depName=renovate
RENOVATE_VERSION='44.111.5'

bash "$(dirname "$0")/install-shellcheck.sh"

npm install -g typescript-language-server

npm install -g "renovate@${RENOVATE_VERSION}"
renovate --version

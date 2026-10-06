---
paths:
  - renovate.json
  - .github/dependabot.yml
  - .devcontainer/*.sh
  - .devcontainer/devcontainer.json
---

# Renovate

- 依存関係の更新は Renovate（`renovate.json`）。共通の設定は共有 preset（[aetos382/renovate-presets](https://github.com/aetos382/renovate-presets) の `default` と `devcontainer`）にあり、`renovate.json` にはこのリポジトリ固有のルールだけを書く。automerge を有効にするルールを足すときは `matchUpdateTypes` を必ず指定する（preset の「major は automerge しない」ルールより後に並ぶため）。
- ただし devcontainer の features だけは Dependabot（`.github/dependabot.yml`）で更新する。Renovate は `devcontainer-lock.json` を更新できないため（renovatebot/renovate#43169）。Renovate が対応したら Dependabot をやめて Renovate に一本化する。
- `renovate.json` をコミットすると、pre-commit フックがステージされた内容を `renovate-config-validator --strict` で検証する。手で実行するときは、リポジトリ直下で `CODESPACES=false renovate-config-validator --strict < /dev/null` と引数なしで実行する（ファイル名を渡すと global config として検証される。Codespaces では `CODESPACES=false` がないとリポジトリ名の入力待ちで止まる）。
- `.devcontainer/*.sh` のツールのバージョンは `# renovate: datasource=... depName=...` コメントの直後の `XXX_VERSION='...'` で Renovate に追従させる。ShellCheck の `SHA256` は Renovate が更新しないので、Renovate の PR で手で書き換える。

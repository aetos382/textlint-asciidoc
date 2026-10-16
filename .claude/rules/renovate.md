---
paths:
  - renovate.json
  - .github/dependabot.yml
  - .github/workflows/**
  - .devcontainer/*.sh
  - .devcontainer/devcontainer.json
---

# Renovate

- 依存関係の更新は Renovate（`renovate.json`）。共通の設定は共有 preset（[aetos382/renovate-presets](https://github.com/aetos382/renovate-presets) の `default` と `devcontainer`）にあり、`renovate.json` にはこのリポジトリ固有のルールだけを書く。automerge を有効にするルールを足すときは `matchUpdateTypes` を必ず指定する（preset の「major は automerge しない」ルールより後に並ぶため）。
- ただし devcontainer の features だけは Dependabot（`.github/dependabot.yml`）で更新する。Renovate は `devcontainer-lock.json` を更新できないため（renovatebot/renovate#43169）。Renovate が対応したら Dependabot をやめて Renovate に一本化する。
- `renovate.json` は、CI の `renovate-config` ジョブが `renovate-config-validator --strict --no-global` で検証する。手元では検証しない。大きく組み替えたときは、`renovate/reconfigure` ブランチに push すると、Mend の Renovate が次の実行でそのブランチの設定を検証し、結果をブランチのステータスで返す。そのブランチから PR を開いていれば、エラーの内容を PR にもコメントする（[Config Validation](https://docs.renovatebot.com/config-validation/)）。毎回の手順にはしない。
- `.devcontainer/*.sh` のツールのバージョンは `# renovate: datasource=... depName=...` コメントの直後の `XXX_VERSION='...'` で Renovate に追従させる。
- action のコミットは `.github/workflows/actions.lock` で固定している。それを作る gh の拡張機能 gh-actions-lock のバージョンは `.devcontainer/versions.sh` の `GH_ACTIONS_LOCK_VERSION` と `renovate.json` の `constraints.ghActionsLock` の 2 箇所にあり、同じ値にする。Renovate は共有 preset の `default` で両方を更新する。手で変えるときも両方を変える。後者は Renovate がロックファイルを作り直すときに使うバージョンである。

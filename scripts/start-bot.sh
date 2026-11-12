#!/usr/bin/env bash
# Menyalakan satu bot di tmux tanpa input manusia.
# Pemakaian: scripts/start-bot.sh <nama-bot>
#
# Pembungkus tipis: logikanya ada di master/src/launch.ts, yang juga dipakai
# master-bot setelah /register (lihat CLAUDE.md, "Menyalakan satu bot").
# Prasyarat:
#   $BOT_SQUAD_HOME/master/.env            berisi OWNER_TELEGRAM_ID=<id>
#   $BOT_SQUAD_HOME/bots/<nama>/state/.env berisi TELEGRAM_BOT_TOKEN=<token>
# READY_TIMEOUT (detik, default 90) mengatur batas waktu siap.
# Token tidak pernah dicetak.
set -euo pipefail
command -v tmux >/dev/null || { echo "start-bot: tmux tidak ditemukan" >&2; exit 1; }
command -v claude >/dev/null || { echo "start-bot: claude tidak ditemukan" >&2; exit 1; }
command -v bun >/dev/null || { echo "start-bot: bun tidak ditemukan" >&2; exit 1; }
exec bun "$(cd "$(dirname "$0")/.." && pwd)/master/src/start-cli.ts" "$@"

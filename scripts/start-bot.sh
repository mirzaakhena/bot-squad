#!/usr/bin/env bash
# Spike: menyalakan satu bot di tmux tanpa input manusia.
# Pemakaian: scripts/start-bot.sh <nama-bot>
#
# Prasyarat (lihat CLAUDE.md, bagian "Menyalakan satu bot"):
#   $BOT_SQUAD_HOME/master/.env            berisi OWNER_TELEGRAM_ID=<id>
#   $BOT_SQUAD_HOME/bots/<nama>/state/.env berisi TELEGRAM_BOT_TOKEN=<token>
# Token tidak pernah dicetak oleh skrip ini.
set -euo pipefail

NAME="${1:-}"
if [[ ! "$NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "pemakaian: $0 <nama-bot>  (huruf kecil, angka, '-')" >&2
  exit 2
fi

ROOT="${BOT_SQUAD_HOME:-$HOME/.bot-squad}"
PLUGIN_DIR="$(cd "$(dirname "$0")/../plugin" && pwd)"
BOTS_DIR="$ROOT/bots"
STATE="$BOTS_DIR/$NAME/state"
WS="$BOTS_DIR/$NAME/workspace"
CLAUDE_JSON="${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json"
READY_TIMEOUT="${READY_TIMEOUT:-90}"

die() { echo "start-bot: $*" >&2; exit 1; }

command -v tmux >/dev/null || die "tmux tidak ditemukan"
command -v claude >/dev/null || die "claude tidak ditemukan"
command -v bun >/dev/null || die "bun tidak ditemukan"
grep -q '^TELEGRAM_BOT_TOKEN=.' "$STATE/.env" 2>/dev/null || die "token tidak ada di $STATE/.env"

# 1. Cegah bot dijalankan dua kali (satu poller per token).
if tmux has-session -t "=$NAME" 2>/dev/null; then
  die "sesi tmux '$NAME' sudah hidup"
fi
if [[ -f "$STATE/bot.pid" ]] && kill -0 "$(cat "$STATE/bot.pid")" 2>/dev/null; then
  die "server plugin untuk '$NAME' masih hidup (pid $(cat "$STATE/bot.pid"))"
fi

umask 077
mkdir -p "$STATE" "$WS"
chmod 600 "$STATE/.env"

# 2. access.json: allowlist berisi pemilik saja, jadi tidak ada pairing.
if [[ ! -f "$STATE/access.json" ]]; then
  OWNER_ID="$(grep '^OWNER_TELEGRAM_ID=' "$ROOT/master/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"' \r")"
  [[ "$OWNER_ID" =~ ^[0-9]+$ ]] || die "OWNER_TELEGRAM_ID tidak valid di $ROOT/master/.env"
  printf '{\n  "dmPolicy": "allowlist",\n  "allowFrom": ["%s"],\n  "groups": {},\n  "pending": {}\n}\n' \
    "$OWNER_ID" > "$STATE/access.json"
fi

# 3. Prompt "trust this folder": tandai folder induk $BOTS_DIR sebagai trusted.
#    Claude Code mewarisi trust dari folder induk, jadi workspace baru di
#    bawahnya tidak memunculkan dialog. Cukup sekali per mesin.
BOTS_DIR="$BOTS_DIR" CLAUDE_JSON="$CLAUDE_JSON" bun -e '
  const fs = require("fs");
  const file = process.env.CLAUDE_JSON, dir = process.env.BOTS_DIR;
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  cfg.projects ??= {};
  // Sudah trusted bila folder ini atau salah satu induknya trusted.
  for (let d = dir; ; d = require("path").dirname(d)) {
    if (cfg.projects[d]?.hasTrustDialogAccepted === true) process.exit(0);
    if (d === require("path").dirname(d)) break;
  }
  cfg.projects[dir] = { ...(cfg.projects[dir] ?? {}), hasTrustDialogAccepted: true };
  const tmp = file + ".bot-squad.tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  console.error("start-bot: trust ditulis untuk " + dir);
'

# 3b. Pasang paket plugin sekali, dengan kunci, sebelum tmux dibuka.
#     Folder plugin dipakai bersama semua bot, dan `bun install` yang berjalan
#     bersamaan di folder yang sama saling bertabrakan (EEXIST / FileNotFound),
#     bahkan saat node_modules sudah lengkap. Karena itu plugin sendiri tidak
#     lagi menjalankan install (script start di plugin/package.json hanya
#     `bun server.ts`), dan di sini install dijalankan bergiliran.
#     Kuncinya folder (mkdir atomik, jalan di macOS dan Linux tanpa flock).
#     Kunci yang pemiliknya sudah mati dianggap basi dan diambil alih.
LOCK="$ROOT/locks/plugin-install.lock"
mkdir -p "$ROOT/locks"
for ((i = 0; ; i++)); do
  if mkdir "$LOCK" 2>/dev/null; then
    echo $$ > "$LOCK/pid"
    break
  fi
  holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [[ -n "$holder" ]] && ! kill -0 "$holder" 2>/dev/null; then
    rm -rf "$LOCK"
    continue
  fi
  ((i < 1200)) || die "kunci install plugin tidak lepas setelah 120s: $LOCK"
  sleep 0.1
done
trap 'rm -rf "$LOCK"' EXIT
bun install --cwd "$PLUGIN_DIR" --no-summary 1>&2 || die "bun install di $PLUGIN_DIR gagal"
rm -rf "$LOCK"
trap - EXIT

# 4. Nyalakan sesi.
#    --setting-sources project,local : abaikan ~/.claude/settings.json (plugin,
#        hook, dan skipDangerousModePermissionPrompt milik pemilik tidak ikut).
#    --settings ...                  : cegah dialog konfirmasi bypass permissions.
#    --plugin-dir                    : muat plugin lokal; namanya jadi bot-squad@inline.
#    --dangerously-load-development-channels plugin:bot-squad@inline : jadikan channel.
#    bot.pid lama dihapus (sudah dipastikan mati di langkah 1) supaya tanda siap
#    di langkah 5 hanya datang dari server plugin sesi ini.
rm -f "$STATE/bot.pid"
tmux new-session -d -s "$NAME" -x 200 -y 50 -c "$WS" \
  -e "TELEGRAM_STATE_DIR=$STATE" \
  claude \
    --setting-sources project,local \
    --settings '{"skipDangerousModePermissionPrompt":true}' \
    --dangerously-skip-permissions \
    --plugin-dir "$PLUGIN_DIR" \
    --dangerously-load-development-channels plugin:bot-squad@inline

# 5. Jawab dialog development channel secara otomatis, lalu tunggu siap.
#    Dialog lain tidak dijawab: pilihan default-nya "No, exit", jadi lebih aman gagal.
answered=0
for ((i = 0; i < READY_TIMEOUT; i++)); do
  sleep 1
  tmux has-session -t "=$NAME" 2>/dev/null || die "sesi '$NAME' berhenti saat start"
  pane="$(tmux capture-pane -p -t "=$NAME:")"
  if grep -q "I am using this for local development" <<<"$pane"; then
    if ((answered == 0)); then tmux send-keys -t "=$NAME:" Enter; answered=1; fi
    continue
  fi
  if grep -qE "Yes, I trust this folder|Yes, I accept|Enter to confirm" <<<"$pane"; then
    die "dialog tak terduga di sesi '$NAME'; lihat: tmux attach -t $NAME"
  fi
  if grep -q "bypass permissions on" <<<"$pane" \
     && [[ -f "$STATE/bot.pid" ]] && kill -0 "$(cat "$STATE/bot.pid")" 2>/dev/null; then
    echo "start-bot: '$NAME' siap (tmux: $NAME, plugin pid $(cat "$STATE/bot.pid"))"
    exit 0
  fi
done
die "'$NAME' belum siap setelah ${READY_TIMEOUT}s; lihat: tmux attach -t $NAME"

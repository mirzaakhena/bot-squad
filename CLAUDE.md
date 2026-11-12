# bot-squad

Sistem untuk menjalankan **banyak bot Telegram berbasis Claude Code** di satu server, yang dikelola lewat satu control panel Telegram bernama **master-bot**.

## Terminologi (wajib konsisten)

- **bot**: satu sesi Claude Code yang berjalan di tmux dan dipasangi plugin channel Telegram custom milik proyek ini (`plugin/`). Tiap bot punya token BotFather sendiri.
- **master-bot**: **BUKAN bot**. Ini aplikasi biasa (tidak berjalan di dalam Claude Code) yang menjadi alat interaksi dan control panel pemilik lewat slash command Telegram. Jangan pernah menyebut master-bot sebagai "bot".
- **pemilik**: satu-satunya user Telegram yang boleh memakai master-bot. Telegram user ID-nya dikonfigurasi manual.

## Cara kerja yang direncanakan

1. Pemilik membuat master-bot lewat @BotFather sehingga mendapat token master-bot.
2. Aplikasi `master/` dijalankan di server dengan token master-bot dan telegram user ID pemilik. Langkah ini manual.
3. Pemilik membuat bot baru lewat @BotFather, misalnya `bot-01`, sehingga mendapat tokennya.
4. Pemilik mendaftarkan bot itu lewat slash command di master-bot dengan memberi nama bot dan token. Bentuk perintahnya masih rancangan, misalnya `/register <nama> <token>`.
5. Master membuat state dir dan working directory untuk bot tersebut, lalu membuka sesi tmux berisi `claude` dengan plugin bot-squad. Bot langsung bisa dipakai.

```
Pemilik (Telegram)
   ├── master-bot ──► master/ (Bun app): registrasi & kontrol semua bot
   ├── bot-01 ──► tmux "bot-01" ──► claude + plugin bot-squad (token bot-01)
   └── bot-02 ──► tmux "bot-02" ──► claude + plugin bot-squad (token bot-02)
```

## Keputusan yang sudah disepakati

- **Fitur master-bot** berupa banyak slash command untuk mengonfigurasi semua bot. Yang pertama adalah registrasi bot. Fitur lain seperti list, stop, restart, logs (isi layar tmux), delete, dan status kuota dikembangkan bertahap.
- **Working directory** dibuat berdasarkan nama bot.
- **Nama bot** hanya boleh berisi huruf kecil, angka, dan `-`, karena dipakai sebagai nama folder dan nama sesi tmux. Nama ini tidak harus sama dengan username Telegram bot-nya.
- **Pengguna**: saat ini hanya pemilik. Ke depan, pemilik ingin bisa mendaftarkan orang lain yang dikunci ke bot tertentu saja (lewat allowlist `access.json` per bot).
- **Mode izin**: bot berjalan bebas dengan `--dangerously-skip-permissions`.
- **Lingkungan**: development di MacBook (darwin), nanti dipindah ke server (kemungkinan Linux). Jangan hardcode hal yang khusus macOS.
- **Stack**: Bun + TypeScript + grammY, sama dengan plugin aslinya.

## Struktur repo

```
bot-squad/            # root project & root git
├── CLAUDE.md
├── master/           # aplikasi master-bot (belum dibuat)
└── plugin/           # fork plugin Telegram resmi, akan diganti nama jadi "bot-squad"
```

- `plugin/` disalin dari `anthropics/claude-plugins-official` → `external_plugins/telegram` (versi 0.0.7, commit upstream `e0ab6e5`). Sengaja disalin apa adanya supaya perubahan fork bisa dilihat lewat `git diff`.
- `../claude-official-telegram-channel/` (di luar repo) adalah salinan upstream untuk referensi. Folder ini **tidak ikut git** dan jangan diubah.

## Data runtime (di luar repo)

Token dan state **tidak boleh** masuk repo.

```
~/.bot-squad/
├── master/.env              # token master-bot + telegram user ID pemilik
├── registry.json            # daftar bot terdaftar (sumber kebenaran untuk master)
└── bots/<nama-bot>/
    ├── state/               # TELEGRAM_STATE_DIR: .env (token), access.json, inbox/, bot.pid
    └── workspace/           # working directory Claude Code untuk bot ini
```

## Fakta teknis dari plugin upstream (`plugin/server.ts`)

- Semua state dibaca dari `TELEGRAM_STATE_DIR` (default `~/.claude/channels/telegram`). Cukup arahkan variabel ini ke direktori berbeda untuk tiap bot agar banyak bot bisa jalan di satu mesin.
- Token dibaca dari `TELEGRAM_BOT_TOKEN`, baik dari environment maupun dari `<STATE_DIR>/.env`. Nilai dari environment yang dipakai lebih dulu.
- `access.json` menyimpan allowlist dan policy. Master bisa menulisnya lebih dulu dengan ID pemilik sehingga **tidak perlu pairing**.
- Telegram hanya mengizinkan **satu poller `getUpdates` per token**. Poller kedua akan mendapat error 409. Master tidak boleh melakukan polling dengan token bot (validasi cukup pakai `getMe`) dan harus mencegah satu bot dijalankan dua kali.
- Plugin mendeklarasikan `claude/channel` dan `claude/channel/permission`, sehingga pesan masuk dan permintaan izin bisa diteruskan lewat Telegram.
- Sesi dijalankan dengan `claude --channels plugin:...`. Flag `--channels` tidak muncul di `claude --help`.

## Concern yang harus ditangani

1. **Keamanan token**: pesan berisi token di chat master-bot sebaiknya langsung dihapus setelah dibaca. Simpan token dengan permission `0600`.
2. **Prompt interaktif saat start** (trust folder, konfirmasi `--dangerously-skip-permissions`, konfirmasi development channel untuk plugin non-marketplace) bisa membuat sesi tmux macet tanpa ada yang menjawab. **Perlu diuji** di Claude Code versi terpasang (2.1.322 saat ditulis).
3. **Ketahanan**: setelah reboot atau crash, master harus mencocokkan `registry.json` dengan sesi tmux yang benar-benar hidup, lalu menghidupkan ulang bot yang mati.
4. **Kuota bersama**: semua bot memakai satu akun Claude.
5. **Penamaan plugin**: ganti nama `telegram` menjadi `bot-squad` (manifest, nama MCP server, skill `/telegram:*`) agar tidak bentrok dengan plugin resmi.

## Status saat ini (2026-11-12)

- [x] Plugin upstream disalin ke `plugin/`
- [x] `git init` di `bot-squad/` (branch `main`), belum ada commit
- [x] Plugin `kerjaan2` (papan tiket) terpasang dengan scope local untuk project ini
- [ ] Commit baseline `plugin/` yang belum diubah
- [ ] Rancang alur `/register <nama> <token>` dari awal sampai bot menyala, lalu didiskusikan dengan pemilik sebelum menulis kode
- [ ] Rebrand `plugin/` menjadi `bot-squad`
- [ ] Bangun `master/`

## Cara bekerja di proyek ini

- Pemilik ingin diajak **berdiskusi dulu** sebelum implementasi. Ajukan rancangan dan concern, tunggu persetujuan.
- Komunikasi dalam Bahasa Indonesia.
- Commit hanya jika diminta.

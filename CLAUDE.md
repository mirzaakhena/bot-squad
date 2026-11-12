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
├── package.json      # workspace Bun: hanya ["master"]; plugin/ memasang dependency-nya sendiri
├── master/           # aplikasi master-bot (Bun + grammY), tes di master/test/
├── scripts/          # start-bot.sh: hasil spike menyalakan satu bot
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
- `--channels` hanya menerima plugin dari allowlist Anthropic (`claude-plugins-official`) atau `allowedChannelPlugins` di managed settings. Plugin lokal kita **tidak** bisa lewat `--channels`: Claude tetap start, tetapi channel tidak terdaftar. Plugin kita harus dimuat dengan `--plugin-dir <repo>/plugin --dangerously-load-development-channels plugin:telegram@inline` (perintah lengkap di bagian "Menyalakan satu bot"). `--channels` dan `--dangerously-load-development-channels` sama-sama tidak muncul di `claude --help`.
- Terdaftar sebagai server MCP saja tidak cukup untuk mengirim pesan masuk: server juga harus disebut di flag channel.

## Menjalankan master-bot

Sekali di root repo: `bun install`. Lalu jalankan dari root repo:

```bash
bun run --cwd master start
```

- Konfigurasi dibaca dari `$BOT_SQUAD_HOME/master/.env` (default `~/.bot-squad/master/.env`, sebaiknya `chmod 600`): `MASTER_BOT_TOKEN=<token dari @BotFather>` dan `OWNER_TELEGRAM_ID=<angka>`. Hanya file ini yang dibaca, bukan environment.
- Kalau ada yang kurang, token ditolak Telegram (401), atau master-bot sudah berjalan di tempat lain (409), aplikasi berhenti dengan kode 1 dan pesan yang menyebut penyebab serta letak file. Token tidak pernah dicetak: semua log disensor.
- Hanya pesan di chat pribadi pemilik yang dilayani. Semua update lain (akun lain, grup, termasuk pesan pemilik di grup, channel, inline query) dibuang tanpa balasan, dan log hanya mencatat `update diabaikan dari <id>`.
- Perintah saat ini: `/start` dan `/help`. Menu Telegram didaftarkan dengan `setMyCommands` setiap start dari daftar `COMMANDS` di `master/src/bot.ts`.
- Tes: `bun test` dari root repo. Tes memakai server Telegram tiruan (`master/test/fake-telegram.ts`), jadi tidak butuh token asli.

## Menyalakan satu bot (hasil spike, Claude Code 2.1.322)

Satu perintah, tanpa input manusia:

```bash
scripts/start-bot.sh <nama-bot>        # contoh: scripts/start-bot.sh uji-01
```

Prasyarat: `~/.bot-squad/master/.env` berisi `OWNER_TELEGRAM_ID`, dan `~/.bot-squad/bots/<nama>/state/.env` berisi `TELEGRAM_BOT_TOKEN`. `BOT_SQUAD_HOME` bisa dipakai untuk mengganti `~/.bot-squad`. Skrip ini menjalankan langkah berikut:

1. Menolak start kalau sesi tmux `<nama>` atau server plugin di `state/bot.pid` masih hidup, karena satu token hanya boleh punya satu poller.
2. Menulis `state/access.json` (kalau belum ada) dengan `dmPolicy: "allowlist"` dan `allowFrom: [OWNER_TELEGRAM_ID]`. Pairing tidak diperlukan, dan pesan dari akun lain dibuang diam-diam, termasuk `/start`.
3. Menandai `~/.bot-squad/bots` sebagai trusted di `~/.claude.json` (`projects["<path>"].hasTrustDialogAccepted = true`). Langkah ini dilewati kalau folder itu atau salah satu induknya sudah trusted. Workspace baru mewarisi trust dari folder induk.
4. Membuka sesi tmux dengan perintah berikut:

```bash
tmux new-session -d -s <nama> -x 200 -y 50 -c ~/.bot-squad/bots/<nama>/workspace \
  -e TELEGRAM_STATE_DIR=$HOME/.bot-squad/bots/<nama>/state \
  claude \
    --setting-sources project,local \
    --settings '{"skipDangerousModePermissionPrompt":true}' \
    --dangerously-skip-permissions \
    --plugin-dir <repo>/plugin \
    --dangerously-load-development-channels plugin:telegram@inline
```

5. Membaca layar tmux setiap detik. Begitu dialog development channel muncul, skrip mengirim `Enter` (pilihan 1 sudah terpilih). Bot dianggap siap kalau baris `bypass permissions on` tampil dan proses di `bot.pid` hidup. Kalau muncul dialog lain, skrip berhenti dengan error tanpa menekan apa pun, karena pilihan default dialog itu adalah "No, exit". Dalam uji, bot siap sekitar 3 detik.

Cara memuat plugin lokal sebagai channel:

- `--plugin-dir <repo>/plugin` memuat plugin untuk sesi ini saja, dengan id `telegram@inline` (`inline` adalah nama marketplace bawaan untuk `--plugin-dir`). Nama server MCP-nya `plugin:telegram:telegram`. Setelah rebrand, id ini menjadi `<nama-baru>@inline`.
- `--dangerously-load-development-channels plugin:telegram@inline` menjadikan plugin itu channel. Ini yang dipakai.
- Alternatif lain yang juga terbukti mendaftarkan channel tetapi **tidak dipilih**:
  - `server:<name>`: daftarkan server lewat `--mcp-config <file.json>` (`{"mcpServers":{"telegram":{"command":"bun","args":["run","--cwd","<repo>/plugin","--shell=bun","--silent","start"],"env":{"TELEGRAM_STATE_DIR":"..."}}}}`), lalu `--dangerously-load-development-channels server:telegram`. Cara ini butuh file JSON per bot, dan skill plugin (`/telegram:access`) tidak ikut termuat. Jangan memakai `--plugin-dir` bersamaan dengan cara ini, karena akan ada dua poller.
  - Marketplace lokal: `--settings` berisi `extraKnownMarketplaces` (sumber `directory`) dan `enabledPlugins`, lalu `plugin:telegram@<marketplace>`. Cara ini membuat Claude Code menulis marketplace ke `~/.claude/plugins/known_marketplaces.json`, yang berlaku global untuk semua sesi. Pada start pertama ada jeda saat Claude memasang plugin.
- `--channels plugin:telegram@inline` tanpa flag development tidak berhasil, karena plugin tidak ada di allowlist.

Prompt yang muncul saat start dan cara menanganinya:

| Prompt | Kapan muncul | Penanganan |
| :- | :- | :- |
| "Quick safety check: Is this a project you created or one you trust?" (default **No, exit**) | Workspace baru yang belum trusted, juga tidak lewat folder induknya | Dicegah: trust `~/.bot-squad/bots` sekali di `~/.claude.json` (langkah 3) |
| "WARNING: Claude Code running in Bypass Permissions mode" (default **No, exit**) | Setiap start dengan `--dangerously-skip-permissions` kalau `skipDangerousModePermissionPrompt` tidak aktif. Di MacBook ini tidak muncul karena sudah aktif di `~/.claude/settings.json`, tetapi muncul begitu pengaturan user diabaikan | Dicegah: `--settings '{"skipDangerousModePermissionPrompt":true}'` |
| "WARNING: Loading development channels" (default **1. I am using this for local development**) | **Setiap** start dengan `--dangerously-load-development-channels`. Jawabannya tidak disimpan, dan tidak ada pengaturan untuk melewatinya (`allowedChannelPlugins` hanya ada di managed settings, yang butuh akses root dan berlaku untuk seluruh mesin) | Dijawab otomatis: `tmux send-keys -t <nama>: Enter` (langkah 5) |

## Concern yang harus ditangani

1. **Keamanan token**: pesan berisi token di chat master-bot sebaiknya langsung dihapus setelah dibaca. Simpan token dengan permission `0600`.
2. **Prompt interaktif saat start** (sudah diuji di Claude Code 2.1.322, lihat "Menyalakan satu bot"). Ada tiga prompt: trust folder dicegah dengan menandai `~/.bot-squad/bots` sebagai trusted di `~/.claude.json`, konfirmasi bypass permissions dicegah dengan `--settings '{"skipDangerousModePermissionPrompt":true}'`, dan konfirmasi development channel **tidak bisa dicegah**, jadi dijawab otomatis dengan `tmux send-keys Enter`. Yang masih rapuh:
   - Jawaban otomatis dan deteksi "siap" bergantung pada teks di layar (`I am using this for local development`, `bypass permissions on`). Teks ini bisa berubah di versi Claude Code berikutnya. Uji ulang setiap kali Claude Code di-upgrade.
   - Penulisan trust ke `~/.claude.json` belum pernah dijalankan dalam spike ini, karena izin agen menolak perubahan konfigurasi Claude. Yang terbukti hanya pewarisan trust dari folder induk. File itu juga ditulis ulang oleh setiap sesi Claude yang sedang berjalan, jadi master sebaiknya menulisnya sekali saat setup, ketika belum ada bot yang hidup.
   - Di server baru, login akun Claude dan onboarding pertama (tema, dll.) belum diuji. Kemungkinan ini langkah manual satu kali.
3. **Ketahanan**: setelah reboot atau crash, master harus mencocokkan `registry.json` dengan sesi tmux yang benar-benar hidup, lalu menghidupkan ulang bot yang mati.
4. **Kuota bersama**: semua bot memakai satu akun Claude.
5. **Penamaan plugin**: ganti nama `telegram` menjadi `bot-squad` (manifest, nama MCP server, skill `/telegram:*`) agar tidak bentrok dengan plugin resmi.
6. **Plugin dan connector pemilik ikut termuat di bot**. `--setting-sources project,local` mencegah plugin dan hook dari `~/.claude/settings.json` (misalnya plugin WhatsApp) ikut masuk ke bot. Tetapi connector akun claude.ai (misalnya Claude Docs, Motion) dan MCP bawaan (claude-in-chrome) tetap termuat, dan bot berjalan bebas izin. Belum dicari cara mematikannya per bot.
7. **Peringatan palsu di layar awal**: bot yang sehat tetap menampilkan `plugin:telegram@inline · plugin not installed`. Peringatan ini hanya dicek terhadap plugin yang terpasang permanen. Saat runtime, channel tetap terdaftar (log debug: `Channel notifications registered`). Jangan memakai baris ini sebagai tanda gagal.
8. **Workspace di dalam repo git lain**: Claude memuat `CLAUDE.md` dan `.claude/` dari folder induk. Workspace bot jangan diletakkan di dalam proyek lain.
9. **Pengaturan user tidak berlaku di bot**: karena `--setting-sources project,local`, model dan effort default dari `~/.claude/settings.json` tidak dipakai. Kalau perlu, berikan lewat `--settings` atau `--model`.

## Status saat ini (2026-11-12)

- [x] Plugin upstream disalin ke `plugin/`
- [x] `git init` di `bot-squad/` (branch `main`), belum ada commit
- [x] Plugin `kerjaan2` (papan tiket) terpasang dengan scope local untuk project ini
- [ ] Commit baseline `plugin/` yang belum diubah
- [ ] Rancang alur `/register <nama> <token>` dari awal sampai bot menyala, lalu didiskusikan dengan pemilik sebelum menulis kode
- [ ] Rebrand `plugin/` menjadi `bot-squad`
- [x] Kerangka `master/`: konfigurasi, hanya melayani pemilik, `/start` dan `/help`
- [ ] Perintah master-bot berikutnya (`/register`, dst.)

## Cara bekerja di proyek ini

- Pemilik ingin diajak **berdiskusi dulu** sebelum implementasi. Ajukan rancangan dan concern, tunggu persetujuan.
- Komunikasi dalam Bahasa Indonesia.
- Commit hanya jika diminta.

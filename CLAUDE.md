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
├── package.json      # workspace Bun: hanya ["master"]; dependency plugin/ dipasang terpisah oleh scripts/start-bot.sh
├── master/           # aplikasi master-bot (Bun + grammY), tes di master/test/
├── scripts/          # start-bot.sh: hasil spike menyalakan bot (satu atau beberapa sekaligus)
└── plugin/           # fork plugin Telegram resmi, sudah diganti nama jadi "bot-squad"
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

- Semua state dibaca dari `TELEGRAM_STATE_DIR` (default upstream `~/.claude/channels/telegram`; di fork kita `~/.claude/channels/bot-squad`). Cukup arahkan variabel ini ke direktori berbeda untuk tiap bot agar banyak bot bisa jalan di satu mesin.
- Token dibaca dari `TELEGRAM_BOT_TOKEN`, baik dari environment maupun dari `<STATE_DIR>/.env`. Nilai dari environment yang dipakai lebih dulu.
- `access.json` menyimpan allowlist dan policy. Master bisa menulisnya lebih dulu dengan ID pemilik sehingga **tidak perlu pairing**.
- Telegram hanya mengizinkan **satu poller `getUpdates` per token**. Poller kedua akan mendapat error 409. Master tidak boleh melakukan polling dengan token bot (validasi cukup pakai `getMe`) dan harus mencegah satu bot dijalankan dua kali.
- Plugin mendeklarasikan `claude/channel` dan `claude/channel/permission`, sehingga pesan masuk dan permintaan izin bisa diteruskan lewat Telegram.
- `--channels` hanya menerima plugin dari allowlist Anthropic (`claude-plugins-official`) atau `allowedChannelPlugins` di managed settings. Plugin lokal kita **tidak** bisa lewat `--channels`: Claude tetap start, tetapi channel tidak terdaftar. Plugin kita harus dimuat dengan `--plugin-dir <repo>/plugin --dangerously-load-development-channels plugin:bot-squad@inline` (perintah lengkap di bagian "Menyalakan satu bot"). `--channels` dan `--dangerously-load-development-channels` sama-sama tidak muncul di `claude --help`.
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
3b. Menjalankan `bun install` di `plugin/` dengan kunci `~/.bot-squad/locks/plugin-install.lock`, supaya beberapa bot bisa dinyalakan bersamaan (lihat "Menjalankan banyak bot bersamaan").
4. Membuka sesi tmux dengan perintah berikut:

```bash
tmux new-session -d -s <nama> -x 200 -y 50 -c ~/.bot-squad/bots/<nama>/workspace \
  -e TELEGRAM_STATE_DIR=$HOME/.bot-squad/bots/<nama>/state \
  claude \
    --setting-sources project,local \
    --settings '{"skipDangerousModePermissionPrompt":true}' \
    --dangerously-skip-permissions \
    --plugin-dir <repo>/plugin \
    --dangerously-load-development-channels plugin:bot-squad@inline
```

5. Membaca layar tmux setiap detik. Begitu dialog development channel muncul, skrip mengirim `Enter` (pilihan 1 sudah terpilih). Bot dianggap siap kalau baris `bypass permissions on` tampil dan proses di `bot.pid` hidup. Kalau muncul dialog lain, skrip berhenti dengan error tanpa menekan apa pun, karena pilihan default dialog itu adalah "No, exit". Dalam uji, bot siap sekitar 3 detik.

Cara memuat plugin lokal sebagai channel:

- `--plugin-dir <repo>/plugin` memuat plugin untuk sesi ini saja, dengan id `bot-squad@inline` (`inline` adalah nama marketplace bawaan untuk `--plugin-dir`). Nama server MCP-nya `plugin:bot-squad:bot-squad`, dan skill-nya `/bot-squad:access` dan `/bot-squad:configure`. Sebelum rebrand, namanya `telegram@inline` dan `plugin:telegram:telegram`.
- `--dangerously-load-development-channels plugin:bot-squad@inline` menjadikan plugin itu channel. Ini yang dipakai.
- Alternatif lain yang juga terbukti mendaftarkan channel tetapi **tidak dipilih**:
  - `server:<name>`: daftarkan server lewat `--mcp-config <file.json>` (`{"mcpServers":{"bot-squad":{"command":"bun","args":["run","--cwd","<repo>/plugin","--shell=bun","--silent","start"],"env":{"TELEGRAM_STATE_DIR":"..."}}}}`), lalu `--dangerously-load-development-channels server:bot-squad`. Cara ini butuh file JSON per bot, dan skill plugin (`/bot-squad:access`) tidak ikut termuat. Jangan memakai `--plugin-dir` bersamaan dengan cara ini, karena akan ada dua poller.
  - Marketplace lokal: `--settings` berisi `extraKnownMarketplaces` (sumber `directory`) dan `enabledPlugins`, lalu `plugin:bot-squad@<marketplace>`. Cara ini membuat Claude Code menulis marketplace ke `~/.claude/plugins/known_marketplaces.json`, yang berlaku global untuk semua sesi. Pada start pertama ada jeda saat Claude memasang plugin.
- `--channels plugin:bot-squad@inline` tanpa flag development tidak berhasil, karena plugin tidak ada di allowlist.

Prompt yang muncul saat start dan cara menanganinya:

| Prompt | Kapan muncul | Penanganan |
| :- | :- | :- |
| "Quick safety check: Is this a project you created or one you trust?" (default **No, exit**) | Workspace baru yang belum trusted, juga tidak lewat folder induknya | Dicegah: trust `~/.bot-squad/bots` sekali di `~/.claude.json` (langkah 3) |
| "WARNING: Claude Code running in Bypass Permissions mode" (default **No, exit**) | Setiap start dengan `--dangerously-skip-permissions` kalau `skipDangerousModePermissionPrompt` tidak aktif. Di MacBook ini tidak muncul karena sudah aktif di `~/.claude/settings.json`, tetapi muncul begitu pengaturan user diabaikan | Dicegah: `--settings '{"skipDangerousModePermissionPrompt":true}'` |
| "WARNING: Loading development channels" (default **1. I am using this for local development**) | **Setiap** start dengan `--dangerously-load-development-channels`. Jawabannya tidak disimpan, dan tidak ada pengaturan untuk melewatinya (`allowedChannelPlugins` hanya ada di managed settings, yang butuh akses root dan berlaku untuk seluruh mesin) | Dijawab otomatis: `tmux send-keys -t <nama>: Enter` (langkah 5) |

## Menjalankan banyak bot bersamaan (hasil spike 261112184702, Claude Code 2.1.322, bun 1.3.11)

Diuji dengan dua bot: `uji-01` (@mirza_001_bot) dan `uji-02` (@mirza_002_bot), dinyalakan hampir bersamaan dengan `scripts/start-bot.sh`.

**Folder state per bot sampai ke plugin.** `TELEGRAM_STATE_DIR` yang diberikan lewat `tmux new-session -e` diwariskan oleh `claude` ke proses server plugin. Komentar di `server.ts` ("Plugin-spawned servers don't get an env block") hanya berarti `.mcp.json` tidak punya blok `env`. Environment proses induk tetap diteruskan. Buktinya: uji-01 polling sebagai @mirza_001_bot dan uji-02 sebagai @mirza_002_bot, masing-masing menulis `bot.pid` di folder state-nya sendiri, dan environment tiap proses `server.ts` berisi `TELEGRAM_STATE_DIR` miliknya. Tidak perlu cara lain.

**Pemasangan paket plugin.** Folder `plugin/` dipakai bersama semua bot. Upstream menjalankan `bun install` setiap kali server plugin start. `bun install` yang berjalan bersamaan di satu folder terbukti saling bertabrakan (`Failed to link which: EEXIST`, `FileNotFound: failed copying files from cache`). Ini terjadi baik saat `node_modules` belum ada maupun saat sudah lengkap. Proses yang kalah keluar dengan kode 1, dan karena script start upstream memakai `&&`, server plugin bot itu tidak pernah jalan. Perbaikannya:

- Script `start` di `plugin/package.json` sekarang hanya `bun server.ts`. Plugin tidak lagi memasang paket sendiri.
- `scripts/start-bot.sh` menjalankan `bun install --cwd plugin` sebelum tmux dibuka, satu per satu, dengan kunci folder `~/.bot-squad/locks/plugin-install.lock` (`mkdir` atomik, jalan di macOS dan Linux tanpa `flock`). Kalau pemilik kunci sudah mati, kuncinya dianggap basi dan diambil alih. Kalau kunci tidak lepas dalam 120 detik, start gagal. Kalau `node_modules` sudah lengkap, install hanya butuh beberapa milidetik.
- Akibatnya, plugin yang dijalankan **di luar** `start-bot.sh` (misalnya `claude --plugin-dir plugin` manual) butuh `bun install` di `plugin/` lebih dulu. Master nanti harus memakai langkah yang sama, atau memanggil `start-bot.sh`.
- Celah kecil yang tersisa: kalau dua proses mendapati kunci basi pada saat yang sama, keduanya bisa masuk bersamaan. Ini hanya terjadi setelah ada start yang crash di tengah install.

**Mematikan satu bot tidak mengganggu bot lain, tetapi `kill -9` meninggalkan server yatim.**

- `tmux kill-session -t uji-01`: server plugin uji-01 benar-benar keluar (dicek dengan `ps` beberapa detik kemudian) dan `bot.pid`-nya terhapus.
- `kill -9` pada proses `claude` uji-01: sesi tmux-nya hilang karena perintah di pane-nya selesai, dan server plugin menjalankan `shutdown()`: `bot.pid` dihapus dan polling berhenti. Tetapi proses `bun server.ts` **tidak keluar**. Proses itu menjadi yatim (ppid 1, status `R`) dan memakan sekitar 99% CPU terus-menerus. Ini teramati berulang di macOS dengan Claude Code 2.1.322 dan bun 1.3.11, dengan atau tanpa shim. Karena `bot.pid` sudah hilang, cek di langkah 1 `start-bot.sh` dan cek pid basi di `server.ts` tidak menemukannya. Start ulang bot itu tetap berhasil (polling sudah berhenti), tetapi proses yatimnya tetap menumpuk.
- Jangan memakai hilangnya `bot.pid` sebagai bukti server sudah mati. `shutdown()` menghapusnya sebelum proses benar-benar keluar. Cek dengan `ps -o pid,ppid,stat,%cpu,etime -p <pid>`.
- Cara membersihkan (belum diuji di spike ini, karena izin agen menolak mematikan proses): cari `bun server.ts` yang environment-nya berisi `TELEGRAM_STATE_DIR` bot itu (`ps -E` di macOS, `/proc/<pid>/environ` di Linux), lalu matikan. `SIGTERM` kemungkinan tidak cukup karena hanya memanggil `shutdown()` lagi, yang sudah macet, jadi pakai `kill -9`. Penyebab macetnya belum dicari (follow-up F1 tiket 261112184702). Master nanti perlu membersihkan server yatim seperti ini sebelum dan sesudah me-restart bot.
- Selama itu, sesi tmux, `bot.pid`, dan polling uji-02 tetap hidup, tanpa 409 atau error di stderr. Menyalakan ulang uji-01 saat uji-02 hidup juga lancar.

Cara merekam stderr plugin (pesan `polling as @...`): taruh shim `bun` di depan `PATH` sebelum `start-bot.sh` dijalankan, misalnya skrip yang menjalankan `exec <bun-asli> "$@" 2> >(tee -a <log> >&2)`. Shim ini hanya terpakai kalau server tmux belum hidup, karena sesi baru mengambil `PATH` dari server tmux. Bun shell di script `start` juga memanggil `bun` lewat `PATH`, jadi shim terpanggil dua kali (`bun run` lalu `bun server.ts`) dan setiap baris stderr tercatat ganda. Kalau perlu, beri shim penanda di environment supaya pemanggilan kedua langsung `exec` ke bun asli. Log ini bisa berisi token (stack trace grammY), jadi simpan di luar repo.

## Concern yang harus ditangani

1. **Keamanan token**: pesan berisi token di chat master-bot sebaiknya langsung dihapus setelah dibaca. Simpan token dengan permission `0600`.
2. **Prompt interaktif saat start** (sudah diuji di Claude Code 2.1.322, lihat "Menyalakan satu bot"). Ada tiga prompt: trust folder dicegah dengan menandai `~/.bot-squad/bots` sebagai trusted di `~/.claude.json`, konfirmasi bypass permissions dicegah dengan `--settings '{"skipDangerousModePermissionPrompt":true}'`, dan konfirmasi development channel **tidak bisa dicegah**, jadi dijawab otomatis dengan `tmux send-keys Enter`. Yang masih rapuh:
   - Jawaban otomatis dan deteksi "siap" bergantung pada teks di layar (`I am using this for local development`, `bypass permissions on`). Teks ini bisa berubah di versi Claude Code berikutnya. Uji ulang setiap kali Claude Code di-upgrade.
   - Penulisan trust ke `~/.claude.json` belum pernah dijalankan dalam spike ini, karena izin agen menolak perubahan konfigurasi Claude. Yang terbukti hanya pewarisan trust dari folder induk. File itu juga ditulis ulang oleh setiap sesi Claude yang sedang berjalan, jadi master sebaiknya menulisnya sekali saat setup, ketika belum ada bot yang hidup.
   - Di server baru, login akun Claude dan onboarding pertama (tema, dll.) belum diuji. Kemungkinan ini langkah manual satu kali.
3. **Ketahanan**: setelah reboot atau crash, master harus mencocokkan `registry.json` dengan sesi tmux yang benar-benar hidup, lalu menghidupkan ulang bot yang mati.
4. **Kuota bersama**: semua bot memakai satu akun Claude.
5. **Penamaan plugin** (selesai, tiket 261112184703): plugin, server MCP, skill, dan nama paket memakai `bot-squad`, dan folder state default menjadi `~/.claude/channels/bot-squad`, sehingga tidak bentrok dengan plugin Telegram resmi. Variabel lingkungan `TELEGRAM_*` sengaja tetap. Akibatnya, kalau kedua plugin dimuat di satu sesi, keduanya membaca token yang sama. Di bot hal itu tidak terjadi, karena `--setting-sources project,local` tidak memuat plugin user.
6. **Plugin dan connector pemilik ikut termuat di bot**. `--setting-sources project,local` mencegah plugin dan hook dari `~/.claude/settings.json` (misalnya plugin WhatsApp) ikut masuk ke bot. Tetapi connector akun claude.ai (misalnya Claude Docs, Motion) dan MCP bawaan (claude-in-chrome) tetap termuat, dan bot berjalan bebas izin. Belum dicari cara mematikannya per bot.
7. **Peringatan palsu di layar awal**: bot yang sehat tetap menampilkan peringatan kuning `plugin:<id>@inline · plugin not installed`, padahal channel berfungsi penuh. Peringatan ini hanya dicek terhadap plugin yang terpasang permanen. Saat runtime, channel tetap terdaftar (log debug: `Channel notifications registered`). Setelah rebrand peringatan ini **masih muncul**, sebagai `plugin:bot-squad@inline · plugin not installed` (diuji di Claude Code 2.1.322). Jangan memakai baris ini sebagai tanda gagal. Kalau `--debug-file` aktif, baris ini bisa tersembunyi di balik "1 more notice hidden".
8. **Workspace di dalam repo git lain**: Claude memuat `CLAUDE.md` dan `.claude/` dari folder induk. Workspace bot jangan diletakkan di dalam proyek lain.
9. **Pengaturan user tidak berlaku di bot**: karena `--setting-sources project,local`, model dan effort default dari `~/.claude/settings.json` tidak dipakai. Kalau perlu, berikan lewat `--settings` atau `--model`.

## Status saat ini (2026-11-12)

- [x] Plugin upstream disalin ke `plugin/`
- [x] `git init` di `bot-squad/` (branch `main`), belum ada commit
- [x] Plugin `kerjaan2` (papan tiket) terpasang dengan scope local untuk project ini
- [ ] Commit baseline `plugin/` yang belum diubah
- [ ] Rancang alur `/register <nama> <token>` dari awal sampai bot menyala, lalu didiskusikan dengan pemilik sebelum menulis kode
- [x] Rebrand `plugin/` menjadi `bot-squad`
- [x] Kerangka `master/`: konfigurasi, hanya melayani pemilik, `/start` dan `/help`
- [ ] Perintah master-bot berikutnya (`/register`, dst.)

## Cara bekerja di proyek ini

- Pemilik ingin diajak **berdiskusi dulu** sebelum implementasi. Ajukan rancangan dan concern, tunggu persetujuan.
- Komunikasi dalam Bahasa Indonesia.
- Commit hanya jika diminta.

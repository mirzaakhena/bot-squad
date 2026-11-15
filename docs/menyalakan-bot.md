# Menyalakan bot: plugin sebagai channel, satu bot, banyak bot

Fakta teknis plugin upstream, langkah `scripts/start-bot.sh` / `master/src/launch.ts`, prompt saat start, pemasangan paket plugin, dan mematikan bot (server plugin yatim).

Rincian ini dipindahkan apa adanya dari `CLAUDE.md` (tiket 261115094501). Rujukan `lihat "<judul bagian>"` yang tidak ada di berkas ini menunjuk ke bagian di berkas `docs/` lain; cari lewat daftar isi di `CLAUDE.md`.

## Fakta teknis dari plugin upstream (`plugin/server.ts`)

- Semua state dibaca dari `TELEGRAM_STATE_DIR` (default upstream `~/.claude/channels/telegram`; di fork kita `~/.claude/channels/bot-squad`). Cukup arahkan variabel ini ke direktori berbeda untuk tiap bot agar banyak bot bisa jalan di satu mesin.
- Token dibaca dari `TELEGRAM_BOT_TOKEN`, baik dari environment maupun dari `<STATE_DIR>/.env`. Nilai dari environment yang dipakai lebih dulu.
- `access.json` menyimpan allowlist dan policy. Master-bot menulisnya dengan ID pemilik saat `/register`. Alur pairing dan skill bawaan upstream sudah dibuang (lihat "Tanpa skill dan tanpa pairing").
- Telegram hanya mengizinkan **satu poller `getUpdates` per token**. Poller kedua akan mendapat error 409. Master tidak boleh melakukan polling dengan token bot (validasi cukup pakai `getMe`) dan harus mencegah satu bot dijalankan dua kali.
- Plugin mendeklarasikan `claude/channel` dan `claude/channel/permission`, sehingga pesan masuk dan permintaan izin bisa diteruskan lewat Telegram.
- `--channels` hanya menerima plugin dari allowlist Anthropic (`claude-plugins-official`) atau `allowedChannelPlugins` di managed settings. Plugin lokal kita **tidak** bisa lewat `--channels`: Claude tetap start, tetapi channel tidak terdaftar. Plugin kita harus dimuat dengan `--plugin-dir <repo>/plugin --dangerously-load-development-channels plugin:bot-squad@inline` (perintah lengkap di bagian "Menyalakan satu bot"). `--channels` dan `--dangerously-load-development-channels` sama-sama tidak muncul di `claude --help`.
- Terdaftar sebagai server MCP saja tidak cukup untuk mengirim pesan masuk: server juga harus disebut di flag channel.

## Menyalakan satu bot (hasil spike, Claude Code 2.1.322)

Satu perintah, tanpa input manusia:

```bash
scripts/start-bot.sh <nama-bot>        # contoh: scripts/start-bot.sh uji-01
```

Skrip ini hanya pembungkus tipis untuk `master/src/start-cli.ts`, yang memakai `master/src/launch.ts`, kode yang sama dengan master-bot. Kode keluar 0 berarti siap, 1 berarti gagal atau sudah berjalan, dan 2 berarti pemakaian salah. `READY_TIMEOUT` (detik) mengubah batas waktu.

Prasyarat: `~/.bot-squad/master/.env` berisi `OWNER_TELEGRAM_ID`, dan `~/.bot-squad/bots/<nama>/state/.env` berisi `TELEGRAM_BOT_TOKEN`. `BOT_SQUAD_HOME` bisa dipakai untuk mengganti `~/.bot-squad`. Skrip ini menjalankan langkah berikut:

1. Menolak start kalau sesi tmux `<nama>` atau server plugin di `state/bot.pid` masih hidup, karena satu token hanya boleh punya satu poller.
2. Menulis `state/access.json` (kalau belum ada) dengan `dmPolicy: "allowlist"` dan `allowFrom: [OWNER_TELEGRAM_ID]`. Pesan dari akun lain dibuang diam-diam, termasuk `/start`.
3. Menandai `~/.bot-squad/bots` sebagai trusted di `~/.claude.json` (`projects["<path>"].hasTrustDialogAccepted = true`). Langkah ini dilewati kalau folder itu atau salah satu induknya sudah trusted. Workspace baru mewarisi trust dari folder induk.
3b. Menjalankan `bun install` di `plugin/` dengan kunci `~/.bot-squad/locks/plugin-install.lock`, supaya beberapa bot bisa dinyalakan bersamaan (lihat "Menjalankan banyak bot bersamaan").
4. Membuka sesi tmux dengan perintah berikut:

```bash
tmux new-session -d -s <nama> -x 200 -y 50 -c ~/.bot-squad/bots/<nama>/workspace \
  -e TELEGRAM_STATE_DIR=$HOME/.bot-squad/bots/<nama>/state \
  claude \
    --setting-sources project,local \
    --settings '{"skipDangerousModePermissionPrompt":true,"statusLine":{"type":"command","command":"bun '"'"'<repo>/plugin/bot-squad-statusline.ts'"'"' '"'"'<state>'"'"'"}}' \
    --dangerously-skip-permissions \
    --plugin-dir <repo>/plugin \
    --dangerously-load-development-channels plugin:bot-squad@inline
```

   `statusLine` hanya ada kalau statusline pendahulu bisa dipastikan (lihat "/context di chat bot").
5. Membaca layar tmux setiap detik. Begitu dialog development channel muncul, skrip mengirim `Enter` (pilihan 1 sudah terpilih). Bot dianggap siap kalau baris `bypass permissions on` tampil dan proses di `bot.pid` hidup. Kalau muncul dialog lain, skrip berhenti dengan error tanpa menekan apa pun, karena pilihan default dialog itu adalah "No, exit". Dalam uji, bot siap sekitar 3 detik.

Cara memuat plugin lokal sebagai channel:

- `--plugin-dir <repo>/plugin` memuat plugin untuk sesi ini saja, dengan id `bot-squad@inline` (`inline` adalah nama marketplace bawaan untuk `--plugin-dir`). Nama server MCP-nya `plugin:bot-squad:bot-squad`. Plugin tidak membawa skill (tiket 261115085701). Sebelum rebrand, namanya `telegram@inline` dan `plugin:telegram:telegram`.
- `--dangerously-load-development-channels plugin:bot-squad@inline` menjadikan plugin itu channel. Ini yang dipakai.
- Alternatif lain yang juga terbukti mendaftarkan channel tetapi **tidak dipilih**:
  - `server:<name>`: daftarkan server lewat `--mcp-config <file.json>` (`{"mcpServers":{"bot-squad":{"command":"bun","args":["run","--cwd","<repo>/plugin","--shell=bun","--silent","start"],"env":{"TELEGRAM_STATE_DIR":"..."}}}}`), lalu `--dangerously-load-development-channels server:bot-squad`. Cara ini butuh file JSON per bot. Jangan memakai `--plugin-dir` bersamaan dengan cara ini, karena akan ada dua poller.
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

**Mematikan satu bot tidak mengganggu bot lain. `kill -9` dulu meninggalkan server yatim; sudah diperbaiki (tiket 261112211001).**

- `tmux kill-session -t uji-01`: server plugin uji-01 benar-benar keluar (dicek dengan `ps` beberapa detik kemudian) dan `bot.pid`-nya terhapus.
- Dulu, `kill -9` pada proses `claude` uji-01 membuat server plugin menjalankan `shutdown()` (`bot.pid` dihapus, polling berhenti) tetapi proses `bun server.ts` **tidak keluar**: yatim (ppid 1, status `R`), sekitar 99% CPU terus-menerus, dan tidak bisa ditemukan lewat `bot.pid`. Teramati di macOS dengan Claude Code 2.1.322 dan bun 1.3.11.
- **Penyebab** (dibuktikan dengan reproduksi kecil tanpa Claude dan Telegram): setelah `claude` mati, pipa stdout/stderr server plugin tidak punya pembaca lagi. `shutdown()` menulis `shutting down` ke stderr, dan tulisan itu gagal dengan `EPIPE` yang dikirim sebagai event `error` di `process.stderr`. Karena tidak ada listener, error itu jatuh ke handler `uncaughtException` di `server.ts`, yang menulis lagi ke stderr, sehingga muncul `EPIPE` baru, begitu seterusnya (ratusan ribu kali per detik). Jadi **akar masalahnya bug di plugin** (warisan upstream): handler error yang menulis ke stderr yang sudah putus. Bun memperparahnya: di bun 1.3.11 loop error ini menghambat timer, sehingga `setTimeout(() => process.exit(0), 2000)` di `shutdown()` tidak pernah jalan. Pada skrip yang sama, Node 22 juga mengalami loop tetapi timernya tetap jalan dan prosesnya keluar setelah 2 detik.
- **Perbaikan**: `server.ts` memasang `process.stderr.on('error', () => shutdown())`. Pipa stderr yang putus berarti Claude sudah pergi, dan error-nya tidak lagi sampai ke `uncaughtException`. EPIPE di stdout (balasan MCP saat Claude mati) ikut tertangani, karena handler `uncaughtException` lalu menulis ke stderr yang putus dan berakhir di listener ini. Setelah `kill -9` pada `claude`, server plugin keluar sekitar 2 detik kemudian. Tesnya ada di `plugin/test/orphan.test.ts`; tes ini dilewati kalau `plugin/node_modules` belum dipasang (`bun install --cwd plugin`).
- **Jaring pengaman di `launch.ts`** (berlaku untuk master-bot dan `start-bot.sh`): setelah cek start ganda lolos, start mencari server sisa milik bot itu dan mematikannya dengan `SIGTERM`, tunggu 2 detik, lalu `SIGKILL` untuk yang masih hidup dan masih dikenali (dicek ulang supaya pid yang dipakai ulang tidak ikut kena). Server sisa dikenali hanya kalau perintahnya `bun ... server.ts`, `CLAUDE_PLUGIN_ROOT`-nya sama dengan folder `plugin/` repo ini, dan `TELEGRAM_STATE_DIR`-nya sama persis dengan folder state bot itu. Proses yang environment-nya tidak terbaca tidak pernah dimatikan. Environment dibaca lewat `ps -E` di macOS dan `/proc/<pid>/environ` di Linux (`master/src/strays.ts`). Setiap proses yang dimatikan menulis satu baris log (`server plugin sisa '<nama>' dimatikan: pid <pid> (SIGTERM|SIGKILL)`) ke stderr master-bot atau `start-bot.sh`. Laporan Telegram tidak berubah, dan kegagalan pembersihan tidak menggagalkan start.
- Plugin lain di mesin (misalnya WhatsApp, juga `bun server.ts`) dibedakan lewat `CLAUDE_PLUGIN_ROOT`, karena baris perintahnya sama persis.
- Jangan memakai hilangnya `bot.pid` sebagai bukti server sudah mati. `shutdown()` menghapusnya sebelum proses benar-benar keluar. Cek dengan `ps -o pid,ppid,stat,%cpu,etime -p <pid>`.
- Selama uji-01 dimatikan (dengan cara apa pun), sesi tmux, `bot.pid`, dan polling uji-02 tetap hidup, tanpa 409 atau error di stderr. Menyalakan ulang uji-01 saat uji-02 hidup juga lancar.

Cara merekam stderr plugin (pesan `polling as @...`): taruh shim `bun` di depan `PATH` sebelum `start-bot.sh` dijalankan, misalnya skrip yang menjalankan `exec <bun-asli> "$@" 2> >(tee -a <log> >&2)`. Shim ini hanya terpakai kalau server tmux belum hidup, karena sesi baru mengambil `PATH` dari server tmux. Bun shell di script `start` juga memanggil `bun` lewat `PATH`, jadi shim terpanggil dua kali (`bun run` lalu `bun server.ts`) dan setiap baris stderr tercatat ganda. Kalau perlu, beri shim penanda di environment supaya pemanggilan kedua langsung `exec` ke bun asli. Log ini bisa berisi token (stack trace grammY), jadi simpan di luar repo.

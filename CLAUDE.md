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
    ├── state/               # TELEGRAM_STATE_DIR: .env (token), access.json, inbox/, bot.pid, plugin.log,
    │                        #   status.json, chained-statusline, statusline.json (untuk /context)
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
- Kalau ada yang kurang, token ditolak Telegram (401), atau proses ini digantikan oleh master-bot lain dengan token yang sama (409, misalnya dari mesin lain atau folder data lain; Telegram memenangkan poller terbaru), aplikasi berhenti dengan kode 1 dan pesan yang menyebut penyebab serta letak file. Token tidak pernah dicetak: semua log disensor.
- Satu folder data hanya boleh punya satu master-bot (tiket 261112211002). Sebelum memanggil Telegram, master mengambil kunci `$BOT_SQUAD_HOME/master/master.pid` (berisi pid, dibuat atomik lewat file sementara + `link`). Instance kedua langsung keluar dengan kode 1 dan pesan di terminal, tanpa satu pun panggilan API, sehingga instance pertama tidak terganggu. Kunci dianggap basi, lalu diambil alih, kalau pid-nya mati, sama dengan pid proses sendiri, atau perintah prosesnya (`ps -o command=`) tidak menjalankan `master/src/main.ts` (atau `src/main.ts` dari `bun run start`). Kunci dihapus saat berhenti normal; setelah crash tidak perlu langkah manual. `MASTER_BOT_API_ROOT` hanya dipakai tes untuk mengarahkan proses `main.ts` ke Telegram tiruan.
- Hanya pesan di chat pribadi pemilik yang dilayani. Semua update lain (akun lain, grup, termasuk pesan pemilik di grup, channel, inline query) dibuang tanpa balasan, dan log hanya mencatat `update diabaikan dari <id>`.
- Perintah saat ini: `/start`, `/help`, `/register <nama> <token>`, `/list`, `/stop <nama>`, `/restart <nama>`, dan `/logs <nama> [n]`. Setiap start, menu Telegram dari daftar `COMMANDS` di `master/src/bot.ts` ditulis ulang (`master/src/menu.ts`) di cakupan `default`, `all_private_chats`, dan chat pemilik, tanpa kode bahasa, lalu menu di `all_group_chats` dan `all_chat_administrators` dihapus. Ini menimpa menu sisa bot lain yang pernah memakai token yang sama (plugin bot-squad mendaftarkan menunya di `all_private_chats`). Menu sisa khusus bahasa tidak ditangani. Gagal di satu langkah hanya peringatan, kecuali 401/409.
- `/register <nama> <token>` (tiket 261112184705): pesan yang memuat argumen langsung dihapus. Nama harus cocok `^[a-z0-9][a-z0-9-]{0,31}$` dan bukan `master`. Ditolak kalau nama sudah ada di registry, folder `bots/<nama>` sudah ada di disk, token salah bentuk, token milik master-bot, atau ID bot dari `getMe` sudah terdaftar. `getMe` 401/404 berarti token tidak valid; jaringan, timeout 10 detik, 429, dan 5xx berarti "coba lagi". Kalau berhasil: `bots/<nama>/{state,workspace}` (0700), `state/.env` (0600), `state/access.json` (allowlist pemilik saja), dan catatan di `registry.json`.
- Setelah registrasi berhasil (tiket 261112184706), master-bot membalas `Menyalakan '<nama>'...` lalu menyalakan bot di latar belakang lewat `master/src/launch.ts` (langkah yang sama dengan `scripts/start-bot.sh`), sehingga perintah lain tetap dilayani. Hasilnya dikirim sebagai pesan kedua: `aktif`, atau `gagal` dengan alasan, 20 baris terakhir layar yang tidak kosong (maks. ~3000 karakter, token disensor) dan `tmux attach -t <nama>` kalau sesinya masih ada. Batas waktu 90 detik. Status di registry menjadi `active` atau `failed`; kalau bot ternyata sudah berjalan, status tidak diubah. Sesi yang gagal dibiarkan hidup supaya bisa dilihat. Laporan gagal menyarankan `/restart <nama>`.
- Laporan penyalaan dikirim ulang kalau Telegram terganggu sementara (tiket 261112214001, `master/src/retry.ts`): error jaringan dan 5xx dicoba lagi dengan jeda 2, 4, 8, 16, 32, lalu 60 detik, total sekitar 10 menit; 429 menunggu `retry_after`. Error 4xx lain (400, 403, ...) tidak dicoba ulang. Setiap percobaan yang gagal dicatat di log (`dicoba lagi dalam N detik`), dan kalau akhirnya tidak terkirim, log mencatat `laporan penyalaan '<nama>' tidak terkirim: <alasan>`. Kalau master-bot dihentikan (Ctrl+C/SIGTERM) saat laporan menunggu, percobaan langsung dihentikan, berhenti tidak ditunda, dan alasannya `master-bot berhenti sebelum laporan terkirim`. Kalau master-bot dihentikan saat bot masih dinyalakan (tiket 261112223102), penyalaan diputus: kalau bot ternyata sudah siap, status menjadi `active` dan sesinya tidak disentuh; kalau belum, sesi tmux-nya dimatikan (`kill-session`) dan status menjadi `failed`. Log mencatat `penyalaan '<nama>' terputus: master-bot berhenti; status ditulis 'failed'` lalu `laporan ... tidak terkirim`. Master-bot menunggu penyalaan paling lama 3 detik, jadi keluar dalam 5 detik setelah SIGINT/SIGTERM. Tesnya `master/test/shutdown.test.ts` (proses `main.ts` sungguhan, server tmux terpisah lewat `TMUX_TMPDIR`). Kalimat `Status tercatat 'failed'` hanya muncul kalau status berhasil ditulis; kalau penulisan registry gagal, laporan aktif maupun gagal memuat `Status di registry gagal dicatat; lihat log master-bot.`
- `/stop <nama>` dan `/restart <nama>` (tiket 261112225302, `master/src/stop.ts`, `master/src/busy.ts`): nama harus lolos aturan nama dan ada di registry; kalau tidak, ditolak tanpa menyentuh apa pun (cara pakai, atau `Bot '<nama>' tidak terdaftar.`). `/stop` membalas `Menghentikan '<nama>'...`, mencatat status `stopped` **lebih dulu** (dihentikan sengaja, supaya nanti tidak dihidupkan otomatis), lalu di latar belakang: `tmux kill-session -t =<nama>`, menunggu server plugin bot itu keluar sendiri paling lama 10 detik, sisanya dimatikan dengan `killStrayServers` (SIGTERM, 2 detik, SIGKILL). Hanya proses yang dikenali `strays.ts` untuk folder state bot itu yang boleh dikirimi sinyal; bukti mati dari daftar proses, bukan dari hilangnya `bot.pid`. Laporan kedua: `dihentikan` atau `memang sudah tidak berjalan`, pid yang dimatikan paksa, dan kalau sesi atau server plugin masih hidup, `Peringatan: ... tidak bersih dihentikan` dengan pid tersisa (status tetap `stopped`, keputusan pemilik Q2). `/restart` membalas `Menyalakan ulang '<nama>'...`, menjalankan langkah stop yang sama tanpa menulis status, lalu menyalakan lewat `launch.ts` dengan laporan dan status `active`/`failed` yang sama dengan `/register`; berlaku juga untuk bot `failed` dan `stopped`. Kalau bot lama tidak bisa dimatikan bersih, bot tidak dinyalakan dan status tidak diubah. Selama satu bot sedang dinyalakan (`/register`, `/restart`) atau dihentikan, `/stop` dan `/restart` untuk bot itu ditolak dengan `'<nama>' sedang <dinyalakan|dinyalakan ulang|dihentikan>, coba lagi setelah selesai.` (Q1). Kuncinya `BotLocks` per master-bot (`createBotLocks()` di `main.ts`, diteruskan ke `createMasterBot` lewat `locks`); pekerjaan lain yang menyalakan atau menghentikan bot harus memakai objek yang sama. Tes: `master/test/stop.test.ts`, `master/test/stop-restart.test.ts`, `master/test/stop-process.test.ts` (proses `main.ts` sungguhan, server tmux terpisah, server plugin tiruan, plugin WhatsApp tiruan sebagai pengamat).
- **Penyalaan otomatis saat master-bot menyala** (tiket 261112225304, `master/src/revive.ts`): setelah menu tersinkron, master-bot mencocokkan `registry.json` dengan keadaan nyata di latar belakang (perintah langsung dilayani). Bot berstatus `active` atau `registered` yang tidak berjalan dinyalakan bersamaan lewat `launchBot` (cek "sudah berjalan" yang sama: sesi tmux atau server plugin `bot.pid`), lalu status menjadi `active`/`failed`. Bot `failed` dan `stopped` tidak dinyalakan; bot yang sudah berjalan tidak disentuh dan statusnya tidak diubah, apa pun statusnya. Folder `bots/` yang tidak terdaftar tidak pernah disentuh. Penyalaan memakai `BotLocks` yang sama dengan `/stop` dan `/restart`; bot yang sedang diproses dilewati. Kegagalan satu bot hanya masuk ringkasan. Setelah semua selesai, pemilik menerima **satu** pesan (dengan kirim ulang `retry.ts`) selama registry berisi minimal satu bot: `Dinyalakan ulang`, `Gagal dinyalakan ulang` (alasan, `tmux attach` kalau sesinya hidup, `/restart <nama>`), dan `Dibiarkan` (sudah berjalan, dihentikan pemilik, atau `failed` dengan petunjuk `/restart <nama>`), tanpa isi layar. Registry kosong tidak mengirim pesan; registry rusak mengirim pesan sebabnya tanpa menyalakan apa pun. Kalau master-bot dihentikan di tengah, penyalaan diputus seperti `/register` dan ringkasan tidak dikirim (log: `ringkasan penyalaan otomatis tidak terkirim`). Tes: `master/test/revive.test.ts`, `master/test/revive-process.test.ts` (proses `main.ts` sungguhan, server tmux terpisah).
- **Keterlambatan pesan pertama ke bot baru (penyebab belum diketahui).** Pada cek tiket 261112184706, pesan "hallo" ke uji-03 bertanggal 21.34.40 di Telegram, tetapi baru masuk ke sesi Claude pukul 21.36.34 (sekitar 114 detik, terlihat dari transkrip sesi uji-03: atribut `ts` dibanding waktu catatan pertama). Yang sudah diperiksa: (1) plugin meneruskan pesan teks ke Claude seketika, tanpa menunggu panggilan jaringan apa pun, jadi jeda terjadi sebelum `getUpdates` menerima pesan, bukan di Claude; (2) sesi Claude saat itu menganggur (catatan pertama transkrip adalah pesan itu sendiri); (3) Mac tidak tidur di rentang itu (`pmset -g log`); log jaringan macOS untuk rentang itu tidak tersedia. Dugaan terkuat: koneksi ke Telegram terganggu (cocok dengan gagalnya laporan master-bot). Saat koneksi putus, grammY mengulang `getUpdates` setiap 3 detik sendiri, jadi jeda kira-kira sama dengan lama gangguan; kalau koneksinya macet tanpa error, satu `getUpdates` bisa menggantung sampai batas waktu client grammY (default 500 detik). Loop percobaan ulang di `plugin/server.ts` (maks. 15 detik) hanya dipakai kalau `bot.start` sendiri gagal. Belum dibuktikan karena tidak ada log stderr plugin uji-03 dari saat itu. Sejak tiket 261112230301, setiap bot selalu merekam waktu pesan masuk dan setiap gangguan `getUpdates` (termasuk percobaan ulang internal grammY) di `state/plugin.log`, jadi kejadian berikutnya bisa dibuktikan dari log itu (lihat "Log tiap bot").
- `/list` (tiket 261112225301, `master/src/list.ts`) hanya membaca: registry, folder `bots/`, sesi tmux, dan `bot.pid`. Tidak ada sesi, proses, atau berkas yang diubah. Satu blok per bot terdaftar, urut nama: nama, `@username`, status tercatat (`terdaftar`, `aktif`, `gagal`, `dihentikan`; nilai lain apa adanya), dan keadaan nyata dengan cek yang sama seperti `runningReason`: `hidup` (sesi tmux dan server plugin di `bot.pid` hidup), `sesi tmux ada, tetapi server plugin mati`, `sesi tmux tidak ada, tetapi server plugin masih hidup`, `mati`, atau `tidak bisa diperiksa` (tmux error). `TIDAK COCOK` ditandai untuk `active` yang tidak `hidup`, `registered` yang `mati`, dan `stopped` yang sesi atau server plugin-nya masih ada. `failed` tidak pernah ditandai (sesinya sengaja dibiarkan). Folder di `bots/` yang namanya sah tetapi tidak ada di registry tampil di bagian `Tidak terdaftar, tidak dikelola master-bot` dengan keadaan nyatanya; sesi tmux tanpa folder di `bots/` tidak pernah ditampilkan. Registry kosong dijawab dengan cara mendaftar, registry rusak dengan pesan dan detail di log. Apa pun yang berbentuk `<angka>:<20+ karakter>` disensor dari balasan.
- `/logs <nama> [n]` (tiket 261112225303, `master/src/logs.ts`) hanya membaca: `tmux has-session`, `tmux capture-pane` (layar yang terlihat), `bot.pid`, dan `state/.env` (untuk sensor). Tanpa `BotLocks`, jadi boleh dipakai saat bot sedang dinyalakan atau dihentikan. `n` 1-50, default 20 (Q1); argumen lain, nama tidak sah, atau angka di luar itu dijawab dengan cara pakai. Nama harus ada di registry (`Bot '<nama>' tidak terdaftar.`). Tanpa sesi tmux, balasannya `tidak hidup` dengan kata keadaan yang sama seperti `/list` dan saran `/restart <nama>`; sesi ada tetapi server plugin mati tetap menampilkan layar plus catatan. Balasan: `n` baris terakhir yang tidak kosong dalam `<pre>`, selalu satu pesan (teks HTML mentah paling panjang 4000 karakter); kalau tidak muat, baris teratas dibuang dan judulnya menyebut jumlah yang tampil. Sensor dijalankan pada seluruh layar dengan baris disambung (token yang patah ke dua baris ikut tertangkap): token bot dan token master-bot (juga bentuk ter-encode URL), setiap nilai di `state/.env` bot itu dan bot lain di `bots/` yang minimal 8 karakter, **potongan** apa pun dari rahasia itu sepanjang 8 karakter atau lebih (baris teratas yang hanya lanjutan wrap, awalan sebelum elipsis, token yang dipisah bingkai), apa pun berbentuk `<angka>:<20+ karakter>`, dan nilai setelah `TELEGRAM_BOT_TOKEN`/`MASTER_BOT_TOKEN` `=` atau `:` sampai spasi atau ujung baris. Tes: `master/test/logs.test.ts`, `master/test/logs-process.test.ts` (proses `main.ts` sungguhan, server tmux terpisah).
- `registry.json`: `{ "bots": { "<nama>": { "telegramId", "username", "status", "createdAt" } } }`, dengan `status` salah satu dari `registered`, `active`, `failed`, `stopped` (dihentikan sengaja lewat `/stop`). Token tidak pernah masuk registry. Ditulis atomik (file sementara, fsync, rename) lewat `master/src/registry.ts`, dan registrasi diproses satu per satu.
- Tes: `bun test` dari root repo. Tes memakai server Telegram tiruan (`master/test/fake-telegram.ts`), jadi tidak butuh token asli.

## Menyalakan satu bot (hasil spike, Claude Code 2.1.322)

Satu perintah, tanpa input manusia:

```bash
scripts/start-bot.sh <nama-bot>        # contoh: scripts/start-bot.sh uji-01
```

Skrip ini hanya pembungkus tipis untuk `master/src/start-cli.ts`, yang memakai `master/src/launch.ts`, kode yang sama dengan master-bot. Kode keluar 0 berarti siap, 1 berarti gagal atau sudah berjalan, dan 2 berarti pemakaian salah. `READY_TIMEOUT` (detik) mengubah batas waktu.

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
    --settings '{"skipDangerousModePermissionPrompt":true,"statusLine":{"type":"command","command":"bun '"'"'<repo>/plugin/bot-squad-statusline.ts'"'"' '"'"'<state>'"'"'"}}' \
    --dangerously-skip-permissions \
    --plugin-dir <repo>/plugin \
    --dangerously-load-development-channels plugin:bot-squad@inline
```

   `statusLine` hanya ada kalau statusline pendahulu bisa dipastikan (lihat "/context di chat bot").
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

## Log tiap bot (`state/plugin.log`, tiket 261112230301)

Server plugin setiap bot selalu menulis `<TELEGRAM_STATE_DIR>/plugin.log` (untuk bot master-bot: `~/.bot-squad/bots/<nama>/state/plugin.log`), tanpa variabel atau flag tambahan, lewat jalur penyalaan apa pun. Kodenya di `plugin/log.ts`, dipanggil dari `plugin/server.ts`. Baris stderr yang lama tetap ada.

- File `0600`. Kalau melewati ~1 MB, file diputar sekali ke `plugin.log.1` (yang lama ditimpa), jadi paling besar ~2 MB per bot. File lama dari proses sebelumnya ikut dihitung.
- Isi pesan tidak pernah ditulis. Token disensor dari setiap baris (token itu sendiri, bentuk ter-encode di URL, dan apa pun yang berbentuk token), dan stack trace tidak ditulis.
- Gagal menulis (disk penuh, folder tidak bisa ditulis) hanya memunculkan satu peringatan `cannot write plugin.log` di stderr; plugin tetap jalan dan pesan tetap diteruskan. Penulisan dicoba lagi di baris berikutnya.
- Setiap baris: `<waktu lokal ISO 8601 + zona> <peristiwa> kunci=nilai ...`. Nilai teks bebas (`alasan`) diberi tanda kutip.

| Peristiwa | Arti |
| :- | :- |
| `mulai pid=<pid>` | Server plugin menyala. |
| `polling-mulai bot=@<username>` | Polling berjalan (sama dengan `polling as @...` di stderr). Muncul lagi setiap kali polling dimulai ulang. |
| `pesan hasil=<hasil> chat= msg= jenis= tanggal= diterima= diteruskan= telat_terima= telat_teruskan= total=` | Satu baris per pesan masuk. `tanggal` = tanggal pesan dari Telegram (resolusi detik), `diterima` = saat `getUpdates` mengembalikan pesan itu, `diteruskan` = saat notifikasi selesai ditulis ke Claude. `telat_terima` = diterima - tanggal, `telat_teruskan` = diteruskan - diterima, `total` = diteruskan - tanggal. `hasil`: `diteruskan`, `izin` (jawaban izin `yes/no xxxxx`), `dibuang` (pengirim tidak di allowlist), `pairing`, `tidak-diteruskan` (perintah plugin `/start`, `/help`, `/status`, `/context`, atau jenis pesan yang tidak didukung), `gagal` (notifikasi ke Claude gagal, ada `alasan`). Selain `diteruskan`/`izin`, kolom waktu teruskan berisi `-`. |
| `getUpdates-gagal ke=<n> durasi= ulang= alasan=` | Satu panggilan `getUpdates` gagal. `ke` = kegagalan ke berapa berturut-turut, `durasi` = lama panggilan itu sampai gagal (koneksi yang macet terlihat di sini, batas client grammY 500 detik), `ulang` = jeda sebelum grammY mencoba lagi (`3s`, atau `retry_after` untuk 429), atau `oleh-plugin` untuk 401/409 yang dilempar ke loop plugin. Ini percobaan ulang internal grammY yang dulu hanya terlihat dengan `DEBUG=grammy:error`. |
| `getUpdates-pulih gagal=<n> sejak= lama=` | `getUpdates` pertama yang berhasil setelah gangguan: berapa kali gagal, sejak kapan, dan berapa lama gangguannya. |
| `polling-gagal ke= ulang= alasan=` | `bot.start` gagal (misalnya 409, atau `getMe` gagal saat start), lalu loop plugin mencoba lagi. |
| `polling-berhenti alasan=` | Polling berhenti: `bot.stop`, `shutdown`, atau 409 yang terus terjadi. |
| `berhenti alasan=` | Server plugin mulai berhenti: `stdin-end`/`stdin-close`/`stdin-tertutup` (Claude pergi), `stderr-putus`, `SIGTERM`, `SIGINT`, `SIGHUP`. |
| `error jenis= alasan=` | Error handler, unhandled rejection, atau uncaught exception. |
| `api-tiruan alamat=` | Hanya di tes (lihat di bawah). |

Cara membaca keterlambatan: cari baris `pesan` dengan `msg` yang sama dengan `message_id` di transkrip. `total` besar dengan `telat_terima` besar berarti pesan terlambat sampai ke plugin (di Telegram atau jaringan); lihat baris `getUpdates-gagal`/`getUpdates-pulih` di sekitar `tanggal` itu untuk penyebabnya. Kalau tidak ada gangguan tercatat tetapi `telat_terima` besar, curigai satu `getUpdates` yang menggantung tanpa error (akan terlihat sebagai `durasi` panjang kalau akhirnya gagal). `telat_teruskan` besar berarti plugin lambat meneruskan (misalnya unduh foto). Kalau `diteruskan` cepat tetapi Claude baru bereaksi lama kemudian (dibanding waktu catatan di transkrip), jedanya ada di Claude. `telat_terima` bisa sedikit negatif (sampai -1 detik) karena `tanggal` dibulatkan ke detik.

`BOT_SQUAD_TELEGRAM_API_ROOT` hanya untuk tes: mengarahkan server plugin ke Telegram tiruan. Hanya `http(s)://localhost`, `127.0.0.1`, atau `[::1]` yang diterima; nilai lain membuat server keluar dengan kode 1 tanpa mencetak token. Tesnya `plugin/test/log.test.ts` dan `plugin/test/plugin-log.test.ts` (dilewati kalau `plugin/node_modules` belum dipasang).

## /context di chat bot (tiket 261112230304)

Pemilik mengetik `/context` di chat bot dan langsung mendapat sisa konteks sesi itu serta kuota akun, tanpa memakai giliran Claude. Isi dan formatnya sama persis dengan `/context` mirza-bots: `plugin/context-render.ts` adalah salinan `renderContext` dari `mirza-bots/cc-plugin/src/engine/context/render.ts` (bagian Context, Rate Limit 5h/7d yang dihilangkan kalau tidak ada data, metadata yang barisnya dilewati, `Last update: HH:MM WIB` dan `(Xm ago)`; reset kuota berupa durasi).

- **Siapa**: hanya pengirim di `allowFrom` bot itu, di chat pribadi (`contextAllowed` di `plugin/context.ts`). Selain itu tidak dibalas sama sekali, juga saat `dmPolicy` `pairing`. `/context` masuk menu plugin dan dicatat di `plugin.log` sebagai `tidak-diteruskan`.
- **Sumber data**: hanya `<state>/status.json` bot itu sendiri, ditulis `plugin/bot-squad-statusline.ts` (bridge) setiap kali Claude Code menggambar ulang baris status. Data bisa basi kalau bot lama menganggur; umurnya terlihat di `Last update`.
- **Bridge** dipasang master saat start (`master/src/statusline.ts`, dipanggil `launch.ts`) lewat `--settings` sesi itu saja. Tidak ada berkas pengaturan Claude yang ditulis. Bridge menangkap payload (gagal menangkap ditelan diam-diam) lalu meneruskan payload yang sama ke statusline pendahulu di `<state>/chained-statusline` (batas 5 detik) dan keluarannya tampil apa adanya; tanpa pendahulu baris statusnya kosong. Pendahulu dicari mengikuti presedens Claude Code: `<workspace>/.claude/settings.local.json`, lalu `<workspace>/.claude/settings.json`, lalu `~/.claude/settings.json` (atau `$CLAUDE_CONFIG_DIR/settings.json`). Akibatnya statusline user pemilik ikut jalan di bot, walau `--setting-sources` tidak memuat pengaturan user.
- **Pagar** (dari README mirza-bots): kalau salah satu berkas itu ada tetapi tak terbaca atau bukan objek JSON, atau yang efektif ternyata bridge bot-squad sendiri, bridge **tidak** dipasang. Rantai ditulis lalu dibaca ulang; tidak cocok berarti batal. Hasilnya dicatat di `<state>/statusline.json`, alasan penolakan juga di log master-bot/`start-bot.sh` (`statusline '<nama>' tidak dipasang: ...`), dan `/context` membalas alasannya. Start bot tidak pernah gagal karena ini.
- **Jawaban lain**: sesi tanpa `statusline.json` (dinyalakan sebelum fitur ini) diminta dinyalakan ulang; `--settings` hanya dibaca saat `claude` start, jadi bot lama baru mendapat `/context` setelah dinyalakan ulang. `status.json` sesi lama dihapus saat start; kalau belum ada, plugin membalas `⏳ Menunggu data statusline...` lalu menunggu berkasnya (12 x 1,5 detik) tanpa menahan update lain. `status.json` yang rusak atau tak terbaca dijelaskan, tanpa angka. Sesi baru sebelum giliran pertama menampilkan `Context (tidak tersedia)` tanpa bagian Rate Limit.
- **Payload nyata** (Claude Code 2.1.323, ditangkap dari sesi uji di tmux tanpa plugin dan tanpa token): sebelum giliran pertama `context_window.used_percentage` bernilai `null` dan `rate_limits` tidak ada. Sesudahnya ada `used_percentage`, `total_input_tokens`, `context_window_size`, dan `rate_limits.seven_day.{used_percentage,resets_at}` (`resets_at` detik epoch); `five_hour` tidak muncul di akun ini saat itu. Statusline dari `--settings` mengalahkan `statusLine` project/local workspace, dan perintahnya berjalan dengan cwd workspace dan environment sesi.
- Tes: `plugin/test/context.test.ts`, `plugin/test/statusline-bridge.test.ts`, `plugin/test/context-command.test.ts` (server sungguhan, dilewati tanpa `plugin/node_modules`), `master/test/statusline.test.ts`.

## Concern yang harus ditangani

1. **Keamanan token**: pesan berisi token di chat master-bot sebaiknya langsung dihapus setelah dibaca. Simpan token dengan permission `0600`.
2. **Prompt interaktif saat start** (sudah diuji di Claude Code 2.1.322, lihat "Menyalakan satu bot"). Ada tiga prompt: trust folder dicegah dengan menandai `~/.bot-squad/bots` sebagai trusted di `~/.claude.json`, konfirmasi bypass permissions dicegah dengan `--settings '{"skipDangerousModePermissionPrompt":true}'`, dan konfirmasi development channel **tidak bisa dicegah**, jadi dijawab otomatis dengan `tmux send-keys Enter`. Yang masih rapuh:
   - Jawaban otomatis dan deteksi "siap" bergantung pada teks di layar (`I am using this for local development`, `bypass permissions on`). Teks ini bisa berubah di versi Claude Code berikutnya. Uji ulang setiap kali Claude Code di-upgrade.
   - Penulisan trust ke `~/.claude.json` belum pernah dijalankan dalam spike ini, karena izin agen menolak perubahan konfigurasi Claude. Yang terbukti hanya pewarisan trust dari folder induk. File itu juga ditulis ulang oleh setiap sesi Claude yang sedang berjalan, jadi master sebaiknya menulisnya sekali saat setup, ketika belum ada bot yang hidup.
   - Di server baru, login akun Claude dan onboarding pertama (tema, dll.) belum diuji. Kemungkinan ini langkah manual satu kali.
3. **Ketahanan**: setelah reboot atau crash, master mencocokkan `registry.json` dengan sesi tmux yang benar-benar hidup saat menyala, lalu menghidupkan ulang bot yang mati (tiket 261112225304, lihat "Penyalaan otomatis"). Master-bot sendiri belum dinyalakan otomatis setelah reboot (perlu systemd/launchd atau sejenisnya).
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
- [x] `/register`: validasi, folder bot, dan registry (belum menyalakan bot)
- [x] `/register` langsung menyalakan bot dan melaporkan aktif atau gagal
- [x] `/stop` dan `/restart` untuk satu bot
- [x] Bot yang seharusnya hidup dinyalakan ulang saat master-bot menyala
- [x] `/list` dan `/logs`
- [ ] Perintah master-bot berikutnya

## Cara bekerja di proyek ini

- Pemilik ingin diajak **berdiskusi dulu** sebelum implementasi. Ajukan rancangan dan concern, tunggu persetujuan.
- Komunikasi dalam Bahasa Indonesia.
- Commit hanya jika diminta.

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
  -e CLAUDE_CODE_RESUME_THRESHOLD_MINUTES=999999999 -e CLAUDE_CODE_RESUME_TOKEN_THRESHOLD=999999999 \
  claude \
    --setting-sources project,local \
    --settings '{"skipDangerousModePermissionPrompt":true,"statusLine":{"type":"command","command":"bun '"'"'<repo>/plugin/bot-squad-statusline.ts'"'"' '"'"'<state>'"'"'"}}' \
    --dangerously-skip-permissions \
    --plugin-dir <repo>/plugin \
    --dangerously-load-development-channels plugin:bot-squad@inline
```

   `statusLine` hanya ada kalau statusline pendahulu bisa dipastikan (lihat "/context di chat bot"). `--continue` ditambahkan tepat setelah `claude` kalau percakapan terakhir dilanjutkan (lihat "Melanjutkan percakapan terakhir").
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

## Melanjutkan percakapan terakhir (`--continue`, tiket 261115100301, Claude Code 2.1.325)

Keputusan pemilik (2026-11-15): `/restart <nama>` dan penyalaan otomatis melanjutkan percakapan terakhir bot, `/restart <nama> new` dan `/register` mulai kosong. `launchBot(name, deps, mode)` menerima `"continue"` atau `"new"` (bawaan `"new"`, dipakai `start-bot.sh`). Hasil `active` membawa `conversation`: `continued`, atau `new` dengan sebab `requested`, `no-history`, atau `continue-failed` (plus alasannya).

**Master-bot yang memutuskan, bukan `claude`:**

1. `hasConversation()` memeriksa apakah folder kerja itu punya transkrip: berkas `*.jsonl` yang tidak kosong di `<config>/projects/<path>/`, dengan `<config>` = `$CLAUDE_CONFIG_DIR` atau `~/.claude`, dan `<path>` = path asli folder kerja (`realpath`) dengan setiap karakter selain huruf dan angka diganti `-`. Path yang hasilnya lebih dari 200 karakter dipotong Claude dan diberi akhiran hash; untuk itu dicari folder berawalan 200 karakter pertama. Hanya membaca daftar berkas; isi transkrip tidak dibaca.
2. Tidak ada transkrip (atau pemeriksaan gagal): `claude` dijalankan **tanpa** `--continue`, hasilnya `no-history`.
3. Ada transkrip: `claude --continue`. Kalau percobaan itu gagal setelah sesi tmux dibuat (claude keluar, dialog tak terduga, atau belum siap sampai batas waktu), sesi yang gagal ditutup (`kill-session`), server plugin sisanya dibersihkan (`killStrays`), lalu dicoba **sekali** lagi tanpa `--continue`; hasilnya `continue-failed`, alasannya masuk laporan dan log (`'<nama>' gagal melanjutkan percakapan terakhir (...)`). Tidak dicoba lagi kalau sesi yang gagal tidak bisa ditutup atau server plugin-nya masih hidup (satu bot tidak boleh berjalan dua kali), atau kalau master-bot sedang berhenti. Kalau percobaan kosong juga gagal, laporan gagal menyebut kedua alasan. Akibatnya `/restart` bisa memakan dua kali batas waktu (2 x 90 detik) dalam kasus terburuk.
4. Dengan `--continue`, tanda siap harus terlihat di dua tangkapan layar berturut-turut (satu detik lebih lama), karena dialog melanjutkan percakapan bisa muncul setelah prompt tampil.

**Layar saat percakapan dilanjutkan.** Isi percakapan lama tampil di atas prompt, jadi bisa memuat teks yang dipakai untuk mengenali dialog (misalnya bot yang membahas bot-squad sendiri). `classifyScreen` karena itu: (a) menganggap prompt sudah tampil kalau `bypass permissions on` ada di 3 baris terbawah yang tidak kosong (footer Claude bisa dua baris, misalnya diikuti `◐ medium · /effort`), dan saat itu teks dialog trust/bypass di layar diabaikan; (b) teks dialog development channel diabaikan hanya setelah dialog itu pernah dijawab di sesi ini; (c) dialog melanjutkan percakapan (`RESUME_DIALOG`) hanya dicari di 15 baris terbawah dan selalu dianggap dialog tak terduga, tidak pernah dijawab.

**Terbukti dengan menjalankan** (claude 2.1.325 sungguhan, HOME sementara tanpa login, server tmux terpisah, Telegram tiruan):

- `claude --continue` di folder tanpa percakapan mencetak `No conversation found to continue` dan keluar dengan kode 1, juga tanpa login. Di tmux sesinya langsung hilang, jadi tanpa langkah 1-3 bot akan dilaporkan `sesi berhenti saat start`.
- Sama halnya kalau folder proyek berisi `.jsonl` tanpa pesan (hanya baris `summary`): claude keluar, dan langkah 3 menyalakan bot dengan percakapan kosong.
- Aturan nama folder proyek (`/`, `.`, `_` menjadi `-`) cocok: transkrip buatan di folder itu ditemukan `--continue` dan isinya tampil di layar, dengan `bypass permissions on` di footer dan tanpa dialog tambahan (transkrip kecil dan baru).
- Transkrip yang memuat teks `I am using this for local development`, `Enter to confirm`, dan `Yes, I trust this folder` tetap berakhir `aktif`/`continued`. Sebelum perbaikan footer dua baris, kasus ini menggantung sekitar 20 detik.

**Belum terbukti (butuh akun Claude yang login; lihat butir pemilik di tiket):**

- Bahwa Claude benar-benar mengingat percakapan setelah `--continue` dan channel plugin tetap menerima pesan. Tanpa login, layar menulis `Channels are not currently available`, jadi dialog development channel tidak muncul di uji ini; urutan dialog itu terhadap tampilnya percakapan lama belum terlihat.
- **Dialog saat melanjutkan percakapan lama** belum pernah terlihat di uji mana pun. Syarat, pencegahan, dan pilihan yang tersisa ada di bagian "Dialog saat melanjutkan percakapan lama" di bawah.
- Setelah bot menyala kosong karena `continue-failed`, percakapan "terakhir" berikutnya adalah yang baru itu (begitu ada giliran); percakapan lama tetap di disk tetapi tidak dipilih lagi oleh `--continue`.

## Dialog saat melanjutkan percakapan lama (tiket 261115105101, Claude Code 2.1.325)

Saat membuka percakapan lama (`--continue` maupun `--resume`), Claude Code menjalankan tiga pemeriksaan berurutan, masing-masing bisa menampilkan dialog. Master-bot tidak pernah menjawab dialog ini; kalau satu muncul, jaring pengaman di "Melanjutkan percakapan terakhir" langkah 3 menyalakan bot dengan percakapan kosong. Dialog pertama dicegah per sesi bot; dua lainnya tidak bisa dicegah per sesi tanpa efek samping.

**Yang dibuat.** Setiap sesi bot yang dibuka `launch.ts` (jadi `/register`, `/restart`, penyalaan otomatis, dan `scripts/start-bot.sh`, pada percobaan `--continue` maupun percobaan kosong) mendapat dua variabel lingkungan lewat `tmux new-session -e` (`RESUME_THRESHOLD_ENV` dan `sessionEnv()`): `CLAUDE_CODE_RESUME_THRESHOLD_MINUTES=999999999` dan `CLAUDE_CODE_RESUME_TOKEN_THRESHOLD=999999999`. Nilai di lingkungan master-bot atau pemanggil `start-bot.sh` tidak dipakai (`-e` menimpanya). Tidak ada berkas konfigurasi Claude yang ditulis, jadi sesi Claude lain di mesin tidak terpengaruh. Bot yang sudah berjalan baru mendapatkannya setelah dinyalakan ulang.

Semua syarat di bawah **hanya dari membaca kode di biner 2.1.325** (`~/.local/share/claude/versions/2.1.325`), kecuali yang disebut di "Terbukti dengan menjalankan". Uji ulang setelah Claude Code di-upgrade: cari `CLAUDE_CODE_RESUME_THRESHOLD_MINUTES??70` dan semua pemakaian `resumeReturnDismissed`.

| Dialog | Muncul kalau (semua harus terpenuhi) | Bisa dicegah per sesi bot? |
| :- | :- | :- |
| 1. `This session is <umur> old and <n> tokens.` Pilihan `Resume from summary (recommended)`, `Resume full session as-is`, `Don't ask me again` | Flag server `tengu_gleaming_fair` atau `tengu_gleaming_fair_reuse` hidup (bawaan mati); `resumeReturnDismissed` di konfigurasi global belum diset; pesan user/assistant terakhir (yang lebih tua dari 1 menit) berumur minimal `CLAUDE_CODE_RESUME_THRESHOLD_MINUTES` menit (bawaan 70); perkiraan token percakapan minimal `CLAUDE_CODE_RESUME_TOKEN_THRESHOLD` (bawaan 100 ribu) | **Ya, sudah dibuat**: dua variabel di atas |
| 2. `Resume this conversation?` (peringatan kuota 5 jam; pilihan melanjutkan, `Start a new conversation`, kadang `Resume from summary`) | Flag server `tengu_amber_tally` berisi tabel kredit yang sah (bawaan kosong, berarti mati); prompt caching aktif untuk model itu; `resumeReturnDismissed` belum diset; akun tidak sedang kena batas kuota; cache percakapan sudah dingin (pesan terakhir lebih tua dari masa cache, 5 menit atau 1 jam) atau modelnya berbeda dari pesan terakhir; perkiraan biaya mengirim ulang konteks minimal `minPercent` (bawaan 5%) dari kuota 5 jam | **Tidak** ada variabel ambang. Lihat pilihan di bawah |
| 3. Tawaran model lebih baru: `You're resuming a <lama> session. Continue with <baru>?` | `resumeReturnDismissed` belum diset; model bawaan sesi lebih baru (keluarga yang sama) dari model percakapan itu dan belum ada pesan dari model baru; aktivitas terakhir minimal 2 jam lalu; harga model baru tidak lebih mahal; flag server `tengu_hidden_volcano` berisi `enabled: true` dan `form` (`line` atau `dialog`); belum ditawarkan 2 kali untuk model itu dan tawaran terakhir (model apa pun) minimal 168 jam lalu | **Tidak** ada variabel. Bentuk `line` hanya satu baris pemberitahuan 60 detik (tidak menghalangi); bentuk `dialog` menghalangi |

Rincian dialog 1 (dasar nilai yang dipilih):

- Kedua nama dibaca dari `process.env` proses `claude` setiap kali diperiksa, bukan dari berkas pengaturan. Nilainya diurai sebagai bilangan bulat: `parseInt` basis 10 (juga menerima notasi `1e9` dan pemisah ribuan `1,000`), tanpa batas bawah atau atas. Nilai yang tidak terbaca sebagai angka terhingga (`Infinity`, kata) **dibuang dan bawaan dipakai**, karena itu nilainya angka desimal polos.
- Dialog dibatalkan kalau umur < ambang menit **atau** token < ambang token. Dengan 999999999 (sekitar 1.900 tahun; 1 miliar token) masing-masing variabel sendirian sudah cukup; keduanya dipasang.
- Syaratnya dihitung dari isi transkrip, jadi sama untuk `--continue` dan `--resume <uuid>`.
- `Don't ask me again` menulis `resumeReturnDismissed: true` ke konfigurasi global (`~/.claude.json`), yang juga mematikan dialog 2 dan 3, untuk semua sesi di mesin.

Catatan dialog 2 dan 3:

- `resumeReturnDismissed` dibaca dari konfigurasi global Claude, bukan dari pengaturan (`settings.json`), jadi `--settings` sesi tidak bisa mengisinya.
- Peringatan kuota (dialog 2) juga punya pemicu `idle`: sesi yang **sedang berjalan** dan lama menganggur bisa ditanyai dengan dialog yang sama sebelum giliran berikutnya. Kapan tepatnya pemicu ini dipanggil, dan apakah berlaku untuk pesan yang masuk lewat channel, belum dibaca. Kalau bot yang lama menganggur tiba-tiba tidak menjawab, periksa layarnya (`/logs <nama>`).
- Tawaran model (dialog 3) yang tampil di sesi bot mencatat `newerModelAsks` di konfigurasi global, jadi ikut menghabiskan jatah 2 tawaran untuk sesi pemilik.

**Pilihan pemilik untuk dialog 2 dan 3** (tidak ada yang dikerjakan di tiket ini):

| Pilihan | Akibat |
| :- | :- |
| A. Biarkan (keadaan sekarang) | Kalau dialog muncul, bot menyala dengan percakapan kosong dan laporan menyebut `percakapan terakhir tidak bisa dilanjutkan (dialog tak terduga muncul di layar)`; percakapan lama tetap di disk. Kedua flag server itu bawaannya mati |
| B. `resumeReturnDismissed: true` di `~/.claude.json` | Mematikan ketiga dialog untuk **semua** sesi di mesin, termasuk sesi pemilik. Cara resminya memilih `Don't ask me again` di dialog 1 saat muncul di sesi pemilik; menulis berkas itu sendiri berisiko karena setiap sesi Claude yang berjalan menulis ulang berkas yang sama |
| C. `CLAUDE_CODE_DISABLE_FEATURE_FLAGS=1` (atau `DISABLE_GROWTHBOOK=1`) di lingkungan sesi bot | Semua flag server kembali ke bawaan di sesi itu saja, jadi ketiga dialog mati. Efek sampingnya luas dan **belum diuji**: fitur lain di balik flag ikut berubah (misalnya pesan antarsesi yang dipakai bot untuk berkirim pesan) |
| D. `DISABLE_PROMPT_CACHING=1` di lingkungan sesi bot | Mematikan dialog 2 saja, tetapi juga mematikan prompt caching, jadi kuota jauh lebih cepat habis. Tidak disarankan |
| E. `CLAUDE_CONFIG_DIR` terpisah untuk bot, dengan `resumeReturnDismissed` di dalamnya | Tidak menyentuh sesi pemilik, tetapi bot kehilangan login, trust, dan riwayat percakapan di `~/.claude`; belum diuji |

**Terbukti dengan menjalankan** (2026-11-15):

- Kedua variabel sampai ke proses `claude` di sesi tmux lewat `/register`, `/restart`, penyalaan otomatis (proses `main.ts` sungguhan, claude tiruan yang mencatat environment-nya) dan lewat `scripts/start-bot.sh` sungguhan, termasuk saat pemanggil sudah punya nilai lain. Tes: `master/test/start-bot-process.test.ts`, `stop-process.test.ts`, `revive-process.test.ts`, `launch.test.ts` ("ambang dialog resume").
- claude 2.1.325 sungguhan (HOME sementara tanpa login, server tmux terpisah) dengan kedua variabel dan `--continue` pada transkrip buatan berumur 5 jam dan sekitar 1,2 MB teks: percakapan lama tampil, `bypass permissions on` di footer, tanpa dialog, dan `ps -E` menunjukkan kedua variabel di proses itu. `.claude.json` HOME uji tidak mendapat `resumeReturnDismissed`.
- Pembanding tanpa variabel pada transkrip yang sama **juga tidak menampilkan dialog**: tanpa login flag servernya mati. Jadi uji ini hanya membuktikan variabel itu tidak mengganggu start; bahwa dialog 1 muncul tanpa variabel dan hilang dengan variabel **belum pernah terlihat**.

**Hanya dari membaca biner (belum terbukti):** semua syarat di tabel, cara nilai diurai, dan bahwa variabel itu benar-benar menahan dialog 1 di akun yang flag-nya hidup. Tes di `launch.test.ts` memakai salinan aturan urai dan syarat dari biner, bukan Claude Code sendiri. Bukti akhirnya butir pemilik di tiket: bot dengan percakapan lebih tua dari 70 menit dan besar, `/restart <nama>`, laporan `Percakapan terakhir dilanjutkan.`

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

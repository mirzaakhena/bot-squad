---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: []
related: []
touches: [master, package.json, CLAUDE.md]
created: 2026-11-12 18:47
---

## Background

master-bot adalah aplikasi biasa, bukan bot Claude, yang menjadi panel kontrol pemilik lewat Telegram. Aplikasi ini belum ada sama sekali. Token master-bot dan ID Telegram pemilik disimpan di luar repo, di folder data bot-squad di home directory.

## Request

Buat aplikasi master-bot paling dasar. Aplikasi ini membaca konfigurasinya dari folder data, hanya menanggapi pemilik, dan menjadi dasar untuk perintah-perintah berikutnya.

## Done when

- [x] Aplikasi bisa dijalankan dengan satu perintah yang tercatat di CLAUDE.md.
- [x] Kalau token atau ID pemilik tidak ada, aplikasi berhenti dengan pesan yang jelas tentang apa yang kurang dan di mana harus mengisinya.
- [x] Kalau token master-bot ditolak Telegram (401) atau master-bot sudah berjalan di tempat lain (409), aplikasi berhenti dengan pesan yang jelas tanpa mencetak token.
- [ ] (owner) Pemilik mengirim /start atau /help ke master-bot dan mendapat daftar perintah.
- [x] Pesan dari akun Telegram lain sama sekali tidak dibalas. Ini dibuktikan dengan tes otomatis.
- [x] Token tidak pernah muncul di log atau di balasan.
- [x] Tidak ada hal yang khusus macOS, sehingga aplikasi juga bisa jalan di Linux.
- [x] Tes otomatis berjalan lewat perintah tes proyek.

## Out of scope

- Perintah /register dan perintah lain selain bantuan.
- Menjalankan master-bot sebagai service yang otomatis menyala saat boot.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Nama variabel token master-bot di ~/.bot-squad/master/.env? Saat ini file itu hanya berisi OWNER_TELEGRAM_ID, dan master-bot belum dibuat di BotFather. Rekomendasi: MASTER_BOT_TOKEN. Pemilik membuat master-bot dan mengisi variabel ini sebelum cek (owner) item 3. Worker tidak butuh token asli, karena tes memakai Telegram tiruan.
  → MASTER_BOT_TOKEN. (owner, 2026-11-12)
- Q2 [answered] Batas 'hanya melayani pemilik': apa saja yang diabaikan? Rekomendasi: yang dilayani hanya pesan di chat pribadi dengan from.id sama dengan OWNER_TELEGRAM_ID. Semua update lain dibuang diam-diam tanpa balasan apa pun: grup (termasuk pesan pemilik di grup), channel, inline query, dan callback dari akun lain. Log hanya mencatat 'update diabaikan dari <id>' tanpa isi pesan. Alternatif: pemilik juga dilayani di grup. Ini tidak disarankan, karena nanti token dikirim lewat chat.
  → hanya DM dengan from.id pemilik, yang lain dibuang diam-diam, dan log tanpa isi pesan. (owner, 2026-11-12)
- Q3 [answered] Susunan proyek dan perintah tes: test_command board ini 'bun test --pass-with-no-tests' dijalankan dari root repo, jadi dependency master harus bisa ditemukan dari root. Pilihan: (a) package.json di root dengan workspaces ['master'], cukup satu 'bun install' di root, lalu master dijalankan dengan 'bun run --cwd master start'; (b) master berdiri sendiri, dan CLAUDE.md mencatat 'bun install --cwd master' sebelum tes. Rekomendasi (a). plugin/ tidak dimasukkan ke workspace, karena plugin memasang dependency-nya sendiri saat start.
  → (a) workspace di root. (owner, 2026-11-12)
- Q4 [answered] Token yang ada tetapi ditolak Telegram (401), dan master-bot yang sudah berjalan di tempat lain (409 dari getUpdates), belum diatur di Done when. Rekomendasi: tambahkan satu baris: 'Kalau token master-bot ditolak Telegram atau master-bot sudah berjalan di tempat lain, aplikasi berhenti dengan pesan yang jelas tanpa mencetak token.' Pilihan lain: biarkan grammY yang menangani (mencoba ulang terus-menerus atau crash dengan stack trace).
  → tambahkan baris Done when soal 401/409 (berhenti dengan pesan jelas, tanpa mencetak token). (owner, 2026-11-12)
- Q5 [answered] Isi /start dan /help: hanya daftar perintah yang sudah ada (/start, /help), atau juga perintah yang akan datang (/register) dengan tanda 'segera'? Lalu, apakah menu perintah Telegram didaftarkan lewat setMyCommands? Rekomendasi: hanya perintah yang sudah berfungsi, dan setMyCommands didaftarkan saat start, supaya menu selalu sesuai dengan yang benar-benar ada.
  → hanya perintah yang sudah berfungsi, ditambah setMyCommands saat start. (owner, 2026-11-12)

## Assumptions
- A1 [confirmed] Lokasi folder data mengikuti BOT_SQUAD_HOME bila diisi, default ~/.bot-squad, sama seperti scripts/start-bot.sh
  Why: Konvensi ini sudah dipakai skrip hasil spike dan tercatat di CLAUDE.md
  If wrong: Hapus pembacaan BOT_SQUAD_HOME di master dan pakai ~/.bot-squad tetap
  Confirmed by owner, 2026-11-12

## Decisions
- Lane strict: kontrol akses master-bot, hanya pemilik yang boleh dilayani
- Tidak solo dan tidak menunggu: aplikasi baru di master/, tidak bergantung pada nama plugin atau hasil spike; 4705 dan 4706 dibangun di atasnya
- 2026-11-12 moved to todo: Disetujui pemilik, semua pertanyaan terjawab
- Red-proof: penjaga akses di bot.ts, tiap syarat isOwnerUpdate (pengirim, jenis chat private, ID chat), cek token kosong, cek ID pemilik kosong dan bukan angka, pesan file tidak ada, penjelasan 401, penjelasan 409, sensor di jalur error run, sensor di logger, sensor token dikenal, tangkapan error saat berhenti, all red
- Konfigurasi hanya dibaca dari file .env di folder data, tidak dari environment, supaya pesan 'di mana mengisinya' selalu menunjuk satu tempat dan variabel shell tidak diam-diam menimpa
- Penjaga akses mensyaratkan pengirim, jenis chat private, dan ID chat sama dengan pemilik sekaligus; dua syarat terakhir berlapis, jadi tes memakai update sintetis supaya tiap syarat teruji sendiri
- Kegagalan bot.stop() ditangkap dan error tak tertangani di proses disensor, karena error jaringan grammY membawa URL berisi token

## Manual checks
- M1 [waiting] (item 4) 1. Buat master-bot di @BotFather.
  2. Isi ~/.bot-squad/master/.env dengan MASTER_BOT_TOKEN=<token> di samping OWNER_TELEGRAM_ID yang sudah ada, lalu chmod 600.
  3. Di root repo jalankan 'bun install' lalu 'bun run --cwd master start'; terminal menampilkan 'berjalan sebagai @<username>'.
  4. Kirim /start ke master-bot dari akun pemilik: muncul daftar perintah /start dan /help.
  5. Kirim /help: daftar yang sama.
  6. Ketik '/' di chat: menu berisi start dan help.
  7. Opsional: kirim /start dari akun lain, tidak ada balasan dan terminal mencatat 'update diabaikan dari <id>'.

## Handoff
Menambah workspace Bun di root (package.json hanya berisi master) dan aplikasi master/: config.ts membaca $BOT_SQUAD_HOME/master/.env (MASTER_BOT_TOKEN, OWNER_TELEGRAM_ID) dan melempar ConfigError yang jelas; access.ts menentukan update milik pemilik (DM pemilik saja); bot.ts memasang penjaga akses sebagai middleware pertama lalu /start dan /help dari daftar COMMANDS; main.ts menjalankan init, setMyCommands, polling, dan menerjemahkan 401/409 menjadi pesan berhenti. Yang tidak boleh rusak: penjaga akses harus tetap middleware pertama sebelum perintah baru apa pun, semua log lewat createLogger yang menyensor token, dan perintah baru ditambahkan ke COMMANDS agar menu dan /help tetap sesuai.

## Review
- 2026-11-12 strict, round 1, at 1aa92a1: passed.
  1: 'bun install' lalu 'bun run --cwd master start' dari root salinan (tercatat di CLAUDE.md bagian 'Menjalankan master-bot') menjalankan src/main.ts; dengan token asli tercetak 'berjalan sebagai @mirza_master_bot'.
  2: dari root dengan BOT_SQUAD_HOME kosong: exit 1, menyebut file .env yang tidak ada dan isi MASTER_BOT_TOKEN/OWNER_TELEGRAM_ID; tes proses terpisah di run.test.ts mencakup token kosong, ID kosong, keduanya, ID bukan angka.
  3: langsung ke Telegram: token palsu -> exit 1 'menolak token (401)' + path .env, token tidak tercetak (7 dari 8 run keluar <=2s; run pertama kena timeout 30s setelah pesan tercetak, tidak terulang). Dua instance dengan token asli -> satu keluar dengan pesan 409, grep token di kedua keluaran = 0.
  4: (owner) M1 bisa diikuti dari awal dan berakhir pada hal yang terlihat; tidak memblokir.
  5: access.test.ts 15 kasus update memeriksa nol panggilan API. Mutasi: penjaga hanya cek from.id -> 10 gagal; penjaga selalu next() -> 16 gagal. Ter-cover.
  6: semua log lewat createLogger/redact; mutasi redact jadi 'return text' -> 3 tes gagal. Keluaran langsung 401/409 tidak memuat token.
  7: grep darwin|/Users|pbcopy|osascript|launchctl|brew di master/ dan package.json kosong; hanya os.homedir/path.join/os.tmpdir. Dinilai dengan membaca dan grep, tidak dijalankan di Linux.
  8: k2 test --dir salinan -- bun test: 46 lulus, 0 gagal; dipulihkan setelah mutasi, 46 lulus.
  note: pada 409 Telegram menghentikan poller LAMA, jadi instance baru yang mengambil alih; dicatat sebagai follow-up F1. Repo tidak punya skrip/CI selain bun test.
- 2026-11-12 conflict resolution, at efd06d9: passed.
  Merge efd06d9 hanya menyelesaikan konflik CLAUDE.md: bagian master-bot dari tiket ini dan rebrand 4703 (plugin:bot-squad@inline, status Rebrand) sama-sama tetap. Tanpa penanda konflik; master/, package.json, bun.lock tidak berubah sejak 1aa92a1.

## Follow-ups
- F1 [ticketed] 409 master-bot: saat instance kedua dijalankan, Telegram memberi 409 kepada poller LAMA, jadi instance yang sudah berjalan berhenti dengan pesan 'sudah berjalan di tempat lain' sementara instance baru mengambil alih diam-diam (teruji langsung dengan token asli 2026-11-12). Pertimbangkan kunci lokal (pid/lock file di $BOT_SQUAD_HOME/master/) agar instance kedua di mesin yang sama menolak start, dan/atau ubah teks pesan 409 agar menjelaskan bahwa proses ini digantikan oleh poller lain.
  → 261112211002

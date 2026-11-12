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

- [ ] Aplikasi bisa dijalankan dengan satu perintah yang tercatat di CLAUDE.md.
- [ ] Kalau token atau ID pemilik tidak ada, aplikasi berhenti dengan pesan yang jelas tentang apa yang kurang dan di mana harus mengisinya.
- [ ] Kalau token master-bot ditolak Telegram (401) atau master-bot sudah berjalan di tempat lain (409), aplikasi berhenti dengan pesan yang jelas tanpa mencetak token.
- [ ] (owner) Pemilik mengirim /start atau /help ke master-bot dan mendapat daftar perintah.
- [ ] Pesan dari akun Telegram lain sama sekali tidak dibalas. Ini dibuktikan dengan tes otomatis.
- [ ] Token tidak pernah muncul di log atau di balasan.
- [ ] Tidak ada hal yang khusus macOS, sehingga aplikasi juga bisa jalan di Linux.
- [ ] Tes otomatis berjalan lewat perintah tes proyek.

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
- A1 [unseen] Lokasi folder data mengikuti BOT_SQUAD_HOME bila diisi, default ~/.bot-squad, sama seperti scripts/start-bot.sh
  Why: Konvensi ini sudah dipakai skrip hasil spike dan tercatat di CLAUDE.md
  If wrong: Hapus pembacaan BOT_SQUAD_HOME di master dan pakai ~/.bot-squad tetap

## Decisions
- Lane strict: kontrol akses master-bot, hanya pemilik yang boleh dilayani
- Tidak solo dan tidak menunggu: aplikasi baru di master/, tidak bergantung pada nama plugin atau hasil spike; 4705 dan 4706 dibangun di atasnya
- 2026-11-12 moved to todo: Disetujui pemilik, semua pertanyaan terjawab

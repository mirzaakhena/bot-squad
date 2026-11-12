---
type: task
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

Rencananya, setiap bot adalah sesi Claude Code yang berjalan di tmux dengan plugin Telegram milik proyek ini. Sampai sekarang belum ada yang pernah benar-benar mencobanya. Masih ada tiga hal yang belum diketahui:

- Bagaimana cara memuat plugin lokal (plugin yang tidak berasal dari marketplace) supaya aktif sebagai channel Telegram.
- Prompt apa saja yang muncul saat sesi dibuka, misalnya percaya folder, konfirmasi mode bebas izin, dan konfirmasi channel development. Prompt seperti ini bisa membuat sesi macet karena tidak ada orang yang menjawab.
- Bagaimana mencegah prompt tersebut muncul, atau menjawabnya secara otomatis.

Versi Claude Code yang terpasang adalah 2.1.322. Untuk spike ini pemilik sudah menyediakan satu token bot uji sementara (khusus ujicoba). Token itu sudah disimpan di `~/.bot-squad/bots/uji-01/state/.env`, dan folder kerja bot uji ada di `~/.bot-squad/bots/uji-01/workspace/`. ID Telegram pemilik ada di `~/.bot-squad/master/.env` (OWNER_TELEGRAM_ID). Token tidak boleh ditulis ke repo, tiket, log, atau commit. Plugin dipakai apa adanya; rebrand dikerjakan di tiket lain.

## Request

Temukan dan catat satu cara yang terbukti berhasil untuk menyalakan satu bot uji dengan satu perintah non-interaktif di tmux. Bot itu harus langsung bisa diajak bicara lewat Telegram oleh pemilik, tanpa pairing dan tanpa ada yang menekan tombol apa pun di sesi tmux.

## Done when

- [x] Ada catatan di CLAUDE.md berisi perintah persis untuk menyalakan satu bot, termasuk cara memuat plugin lokal sebagai channel.
- [x] Catatan itu mendaftar setiap prompt yang muncul saat start, lengkap dengan cara mencegah atau menjawabnya otomatis.
- [x] Mengikuti catatan itu dari folder kerja yang benar-benar baru, sesi tmux sampai ke kondisi siap tanpa input manusia.
- [x] (owner) Pemilik mengirim pesan ke bot uji di Telegram dan mendapat balasan dari Claude.
- [ ] (owner) Pesan dari akun Telegram selain pemilik tidak dibalas dan tidak menghasilkan kode pairing.
- [x] Hal yang tidak berhasil atau masih belum pasti dicatat di bagian concern CLAUDE.md.

## Out of scope

- Menulis kode master-bot.
- Menjalankan lebih dari satu bot.
- Mengganti nama plugin.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Trust folder dicegah dengan menulis hasTrustDialogAccepted untuk ~/.bot-squad/bots di ~/.claude.json, tidak dengan menjawab dialog trust otomatis
  Why: Trust diwariskan ke subfolder, jadi cukup ditulis sekali; menjawab dialog yang default-nya 'No, exit' berisiko membuat sesi keluar
  If wrong: Hapus entri projects["~/.bot-squad/bots"] dari ~/.claude.json dan ganti langkah 3 skrip dengan menjawab dialog lewat tmux send-keys Down Enter
  Confirmed by owner, 2026-11-12
- A2 [confirmed] Bot dijalankan dengan --setting-sources project,local supaya plugin dan hook global pemilik (WhatsApp, playwright, hook kerjaan2) tidak ikut termuat
  Why: Bot berjalan bebas izin; plugin pemilik yang lain tidak perlu ada di bot
  If wrong: Hapus --setting-sources dari skrip; prompt bypass tetap dicegah oleh --settings
  Confirmed by owner, 2026-11-12

## Decisions
- 2026-11-12 moved to todo: Pemilik memberi token uji untuk tiket ini
- Plugin dimuat dengan --plugin-dir + plugin:telegram@inline, bukan server:<name> lewat --mcp-config atau marketplace lokal. Alasannya: berlaku hanya untuk sesi itu, tidak menulis konfigurasi global (marketplace lokal menulis known_marketplaces.json), tidak butuh file JSON per bot, dan skill plugin tetap ikut. Ketiganya terbukti mendaftarkan channel

## Manual checks
- M1 [ok] (item 4) 1. Di terminal Mac, buka folder repo bot-squad (setelah tiket ini di-merge) atau worktree tiket ini.
  2. Jalankan: scripts/start-bot.sh uji-01. Langkah ini akan menandai ~/.bot-squad/bots sebagai trusted di ~/.claude.json.
  3. Tunggu sampai muncul baris "start-bot: 'uji-01' siap" (sekitar 3 detik).
  4. Dari akun Telegram pemilik, kirim pesan apa saja ke bot uji.
  5. Yang seharusnya terjadi: balasan dari Claude muncul di Telegram. Kalau perlu, lihat sesinya dengan tmux attach -t uji-01.
  Checked by owner, 2026-11-12
- M2 [waiting] (item 5) 1. Pastikan bot uji-01 sudah hidup (langkah 1-3 dari item 4).
  2. Dari akun Telegram lain (bukan pemilik), kirim pesan biasa ke bot uji, lalu kirim /start.
  3. Yang seharusnya terjadi: tidak ada balasan sama sekali, termasuk tidak ada kode pairing.
  4. Pastikan juga ~/.bot-squad/bots/uji-01/state/access.json tetap berisi "pending": {}.
  5. Matikan bot dengan: tmux kill-session -t uji-01.

## Handoff
Menambah scripts/start-bot.sh <nama> dan bagian 'Menyalakan satu bot' di CLAUDE.md. Skrip ini menolak start ganda (sesi tmux atau bot.pid masih hidup), menulis access.json berisi allowlist pemilik, menandai ~/.bot-squad/bots sebagai trusted, lalu membuka tmux dengan claude --setting-sources project,local --settings skipDangerousModePermissionPrompt --dangerously-skip-permissions --plugin-dir plugin --dangerously-load-development-channels plugin:telegram@inline. Setelah itu skrip menjawab dialog development channel dengan Enter. Yang tidak boleh rusak: id channel mengikuti nama di manifest plugin, jadi setelah rebrand 'telegram@inline' di skrip dan CLAUDE.md harus ikut diganti. Deteksi siap juga bergantung pada teks layar Claude Code 2.1.322.

## Review
- 2026-11-12 standard, round 1, at 423913f: passed.
  1: Bagian 'Menyalakan satu bot' di CLAUDE.md memuat start-bot.sh dan perintah tmux+claude lengkap (--plugin-dir + --dangerously-load-development-channels plugin:telegram@inline). Saat dijalankan, layar menampilkan 'Channels ... plugin:telegram@inline inject directly'.
  2: Tiga prompt di tabel saya munculkan di tmux tanpa pencegahan (trust, Bypass Permissions, development channel), lengkap dengan default-nya. Dengan pencegahan dari catatan, dua yang pertama tidak muncul dan yang ketiga dijawab skrip. Snippet trust diuji pada JSON sintetis: menulis, 0600, melewati induk trusted.
  3: start-bot.sh uji-01 dari salinan HEAD dengan workspace baru (BOT_SQUAD_HOME di bawah induk trusted): exit 0 dalam 2 detik. bot.pid=bun server.ts, TCP 443 ESTABLISHED, satu-satunya poller Telegram. Start kedua ditolak (exit 1), nama Uji_01 ditolak (exit 2).
  4: (owner) M1 bisa diikuti dari awal dan berakhir pada balasan yang terlihat di Telegram.
  5: (owner) M2 bisa diikuti dan berakhir pada 'tidak ada balasan/kode pairing' dan pending {}. access.json yang ditulis berisi allowlist pemilik saja.
  6: Concern 2 dan 6-9 di CLAUDE.md sesuai dengan yang saya amati, termasuk 'plugin not installed' di layar bot yang sehat.
  note: Dinilai dengan membaca: tulis trust ke ~/.claude.json asli tidak dijalankan (konfigurasi pemilik), baru terbukti di M1. Kunci trust memakai path mentah; BOT_SQUAD_HOME relatif atau lewat symlink bisa tidak cocok. Tidak ada skrip/CI selain bun test.

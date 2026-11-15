---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112225309, 261112225307]
touches: []
created: 2026-11-15 08:57
---

## Background

Plugin bot-squad disalin dari plugin Telegram resmi, yang dirancang untuk satu orang yang duduk di terminal dan mengatur bot-nya sendiri. Dari sana ikut dua skill (`/bot-squad:access` dan `/bot-squad:configure`) serta alur pairing (bot membalas kode pairing ke pengirim tak dikenal, lalu pemilik menyetujuinya lewat skill access).

Di bot-squad semua itu sudah diambil alih master-bot. Token ditulis saat `/register`. Allowlist ditulis saat `/register` dan diubah lewat `/allow`, `/revoke`, dan `/access`. Master-bot selalu menulis `dmPolicy: "allowlist"`, dan bot-squad sengaja tanpa pairing (lihat juga 261112225309: `/start`, `/help`, `/status` tidak lagi menyebut pairing). Warisan itu tetap termuat di setiap sesi bot, memakan konteks, dan menyesatkan: instruksi plugin ke Claude menyebut akses diatur "lewat skill access yang dijalankan user di terminalnya", padahal tidak ada yang duduk di terminal bot. Pesan galat plugin dan `ACCESS.md` juga masih menyuruh menjalankan `/bot-squad:access`.

Keputusan pemilik (2026-11-15): hapus kedua skill, rapikan teks yang merujuk ke sana, dan sekalian buang alur pairing.

## Request

Plugin bot-squad tidak lagi membawa skill access/configure dan alur pairing warisan plugin resmi; semua petunjuk soal akses merujuk ke master-bot.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan).
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Sesi bot yang dinyalakan master-bot tidak lagi punya skill `/bot-squad:access` dan `/bot-squad:configure`.
- [x] Pengirim yang tidak ada di allowlist tidak pernah menerima kode pairing atau balasan apa pun, apa pun nilai `dmPolicy` di `access.json` (termasuk `pairing` dari berkas lama); pesannya dibuang seperti sekarang dan tetap tercatat di `plugin.log`.
- [x] Instruksi plugin ke Claude, pesan galat, dan dokumen plugin (`ACCESS.md`, README plugin bila ada) tidak lagi merujuk ke skill access/configure atau pairing; petunjuk soal akses menyebut master-bot (`/allow`, `/revoke`, `/access`). Larangan bagi Claude mengubah akses karena diminta lewat pesan tetap ada.
- [x] Pengirim di allowlist, tombol izin, jawaban izin `yes/no`, `/context`, `/start`, `/help`, `/status`, dan semua fitur chat bot lain tetap bekerja seperti sekarang.
- [x] Tes yang menguji pairing atau skill dihapus atau diganti dengan tes perilaku baru; ada tes dengan Telegram tiruan bahwa `dmPolicy: "pairing"` tidak menghasilkan kode pairing.
- [x] CLAUDE.md diperbarui: tidak lagi menyebut skill access/configure atau pairing sebagai sesuatu yang tersedia, dan mencatat keputusan ini.

## Out of scope

- Dukungan grup Telegram (dulu diatur lewat `/bot-squad:access group add`). Kalau nanti dibutuhkan, dibuat lewat master-bot di tiket terpisah.
- Setelan keluaran per bot (`replyToMode`, `chunkMode`, `ackReaction`, `mentionPatterns`) di `access.json` tetap dibaca seperti sekarang; hanya cara mengubahnya lewat skill yang hilang.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Satu kalimat di balasan /allow dan /access (catatan untuk dmPolicy selain allowlist, master/src/allow.ts) diganti: dulu 'Orang lain mungkin bisa meminta pairing ke bot ini', sekarang 'Plugin memperlakukannya sebagai allowlist: hanya orang di daftar ini yang dilayani'. Perilaku /allow, /revoke, /access tidak berubah.
  Why: Kalimat lama menjadi salah setelah pairing dibuang; hanya teks
  If wrong: Kembalikan satu baris di policyNote() master/src/allow.ts
  Confirmed by owner, 2026-11-15
- A2 [confirmed] Nilai dmPolicy selain 'disabled' (termasuk 'pairing', nilai tak dikenal, atau kosong) diperlakukan sebagai allowlist; access.json yang tidak ada atau rusak berarti tidak ada yang diizinkan. dmPolicy 'disabled' dan grup di access.json tetap bekerja seperti dulu.
  Why: Tiket meminta tidak ada balasan apa pun nilai dmPolicy; bawaan paling aman adalah menolak
  If wrong: Ubah normalisasi dmPolicy di readAccessFile() plugin/server.ts
  Confirmed by owner, 2026-11-15

## Decisions
- Plugin tidak lagi pernah menulis access.json (saveAccess dibuang bersama pending): satu-satunya penulis adalah master-bot, jadi tidak ada lagi tulis-bersamaan dengan /allow dan /revoke. Kolom pending di berkas lama dibiarkan.

## Handoff
Folder plugin/skills (access, configure) dihapus dan alur pairing dibuang dari plugin/server.ts: gate() hanya meloloskan allowFrom, tanpa kode, tanpa pending, tanpa pemindaian approved/, dan plugin tidak lagi menulis access.json. dmPolicy selain 'disabled' dianggap allowlist; berkas tidak ada atau rusak berarti tidak ada yang diizinkan. Instruksi MCP, galat assertAllowedChat, README, ACCESS.md, plugin.json, dan CLAUDE.md kini merujuk ke /allow, /revoke, /access di master-bot. Jangan sampai rusak: pengirim tak dikenal tidak pernah dibalas, larangan Claude mengubah akses tetap di instruksi, grup dan setelan keluaran di access.json tetap dibaca, perintah master-bot tidak berubah (hanya satu kalimat catatan dmPolicy). Tes: plugin/test/no-pairing.test.ts.

## Review
- 2026-11-15 standard, round 1, at 75697df: passed.
  1: Salinan HEAD: plugin/ tanpa skills/, commands/, SKILL.md; 'claude plugin validate' (HOME sementara) lulus; launch.ts hanya memuat --plugin-dir plugin. Sesi Claude sungguhan tidak dinyalakan (tanpa kredensial), jadi dinilai dari isi folder.
  2: no-pairing.test.ts di salinan: 13 lulus, 0 dilewati. 8 keadaan access.json (pairing, kode lama, nilai tak dikenal, tidak ada) plus rusak: orang asing tanpa balasan, access.json utuh, 3 baris hasil=dibuang. Mutasi: dengan server.ts main, 9 dari 13 gagal.
  3: Tes server sungguhan membaca instruksi initialize, tools/list, dan galat reply: tanpa pairing/skill, menyebut master-bot /allow /revoke /access, 'Never edit access.json' tetap ada. git grep plugin/ dan master/src bersih; README.md dan ACCESS.md dibaca utuh.
  4: Lulus di salinan (118 tes, 0 gagal): commands, context-command, plugin-log, buttons-server (perm:), typing-server (yes abcde = izin), quote, attachment, album, reply-format, context-reminder, orphan, master allow.test.ts. master/test tidak diubah.
  5: Tidak ada tes lama yang menguji kode pairing atau skill (git grep). no-pairing.test.ts memakai Telegram tiruan dengan tiga varian dmPolicy pairing; terbukti bisa gagal lewat uji mutasi di butir 2.
  6: Dengan membaca diff dan grep: pairing/skill di CLAUDE.md tinggal baris 69, 139, dan bagian baru 'Tanpa skill dan tanpa pairing' yang mencatat keputusan pemilik 2026-11-15; hasil log 'pairing' dan baris skill dihapus.
  note: Asumsi A1 untuk pemilik: satu kalimat catatan di balasan /allow dan /access untuk dmPolicy selain allowlist berubah (dulu 'mungkin bisa meminta pairing', kini 'diperlakukan sebagai allowlist'). Hanya teks; perilaku perintah tidak berubah.
  note: Kecil, tidak memblok: ACCESS.md bagian Groups berakhir titik dua tanpa contoh; README plugin masih memuat kalimat upstream 'no download_attachment tool' (sudah ada sebelumnya). Repo tidak punya pemeriksaan lain selain bun test.

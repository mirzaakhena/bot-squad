---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 21:09
---

## Background

Sejak tiket 261115202403, perintah master-bot tanpa nama (`/stop`, `/restart`, `/new`, `/logs`, `/access`, `/delete`, `/revoke`) menampilkan bot terdaftar sebagai tombol. Reviewer tiket itu menemukan bahwa pemilih menampilkan **semua** nama di `registry.json`, juga nama yang tidak lolos aturan nama bot (huruf kecil, angka, dan `-`), misalnya `../luar` di registry yang diedit tangan.

Kalau diketik, nama seperti itu ditolak dengan cara pakai sebelum apa pun disentuh. Lewat tombol, pekerjaannya jalan: `/stop`, `/restart`, dan `/delete` menolak nama itu sendiri di lapisan bawah, tetapi `/access` dan `/revoke` bisa membaca atau menulis `access.json` di luar folder `bots/`.

Master-bot sendiri tidak pernah menulis nama tidak sah ke registry, jadi ini hanya terjadi kalau registry diedit tangan atau rusak. Nama bot dipakai sebagai nama folder dan nama sesi tmux, jadi aturan nama harus berlaku di semua jalur.

## How to reproduce

1. Siapkan folder data uji dengan `registry.json` berisi satu bot sah dan satu entri bernama `../luar`.
2. Jalankan master-bot terhadap folder data itu, lalu kirim `/access` tanpa argumen.
3. Tombol `../luar` tampil. Menekannya membuat master-bot membaca `access.json` di luar folder `bots/`, padahal `/access ../luar` yang diketik dijawab cara pakai.

## Request

Jalur tombol memperlakukan nama bot persis seperti jalur yang diketik: nama yang tidak lolos aturan nama tidak pernah menjadi tombol dan tidak pernah dijalankan.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.


## Done when

- [x] Pemilih bot hanya menampilkan nama yang lolos aturan nama bot; nama tidak sah di registry tidak tampil sebagai tombol untuk perintah mana pun.
- [x] Ketukan tombol yang entah bagaimana merujuk nama tidak sah ditolak sebelum berkas, sesi, atau proses apa pun dibaca atau diubah.
- [x] `/access` dan `/revoke` lewat tombol tidak pernah membaca atau menulis berkas di luar folder `bots/` di folder data, dibuktikan dengan registry uji yang memuat nama seperti `../luar`.
- [x] Kalau registry hanya berisi nama tidak sah, perintah tanpa argumen dijawab seperti belum ada bot, tanpa tombol.
- [x] Bot bernama sah di registry yang sama tetap tampil dan bekerja seperti sekarang; perintah yang diketik tidak berubah.
- [x] Ada tes untuk butir-butir di atas, dan seluruh tes tetap lulus.
- [x] Dokumentasi proyek mencatat bahwa pemilih mengabaikan nama tidak sah.

## Out of scope

- Memperbaiki atau melaporkan registry yang berisi nama tidak sah (misalnya di `/list`).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Nama 'master' di registry tetap tampil sebagai tombol
  Why: 'master' lolos aturan nama (hanya /register yang menolaknya), dan /stop master yang diketik juga diterima; tiket meminta jalur tombol sama dengan jalur diketik
  If wrong: tambahkan RESERVED_NAMES ke saringan isBotName di master/src/picker.ts dan ke withNameRule di master/src/bot.ts
  Confirmed by owner, 2026-11-15

## Handoff
Aturan nama bot untuk perintah bernama kini dicek di satu tempat: withNameRule(caraPakai, kerja) di master/src/bot.ts. named(), showLogs, dan changeAndReply.allow/revoke dibungkus dengannya, dan jalur diketik maupun tombol pemilih memanggil fungsi bungkusan yang sama; cek NAME_RULE terpisah di penangan perintah dibuang. picker.ts menyaring nama tidak sah saat bertanya (tidak dihitung; hanya nama tidak sah = belum ada bot) dan menolak ketukan yang merujuknya sebelum registry dibaca. Jangan sampai rusak: pekerjaan baru yang menerima nama bot harus lewat named() atau withNameRule; /keys masih mengecek NAME_RULE sendiri. isBotName di PickerDeps hanya untuk tes.

## Review
- 2026-11-15 standard, round 1, at 96a4e7d: passed.
  1: Salinan HEAD: picker-names + picker.test lulus 231/231. Mutasi buang .filter(isBotName) di picker.ask menggagalkan 123 tes. Uji reviewer, registry ['../luar','pn-a']: /access dan /revoke hanya menampilkan [pn-a, cancel]; di main '../luar' ikut tampil.
  2: Mutasi buang penolakan isBotName di picker.handle menggagalkan 29 tes (registry dirusak sebelum ketukan, log tanpa 'registry tidak bisa dibaca', pekerjaan tidak dipanggil). Nomor tombol palsu 0..3 di uji reviewer: tidak ada berkas berubah, tidak ada panggilan stop/launch/tmux.
  3: Umpan induk/data/luar/state/access.json (8002, UMPAN-RAHASIA): di HEAD tidak pernah muncul di panggilan Telegram mana pun; isi dan mtime (ns) umpan sama; tidak ada berkas berubah/baru/hilang. Kontrol: skrip yang sama di main membocorkannya dan mengubah berkas umpan.
  4: Tes per perintah 'registry hanya berisi nama tidak sah' (PICK_NO_BOTS, tanpa reply_markup) lulus di HEAD dan gagal di mutasi saringan.
  5: Skrip reviewer di salinan HEAD vs main: 42 perintah diketik (sah, tidak terdaftar, ../luar, salah bentuk, /allow, /keys, /help, /list) dan 7 perintah lewat tombol dengan registry sah: balasan dan panggilan stop/launch/tmux IDENTIK. Mutasi buang cek withNameRule menggagalkan 22 tes.
  6: master/test/picker-names.test.ts mematikan ketiga mutasi (saringan, penolakan ketukan, withNameRule); seluruh tes tercatat lulus oleh k2 pada isi yang ditinjau (tidak diulang, sesuai brief).
  7: Dengan membaca: docs/master-bot.md mendapat butir 'Pemilih mengabaikan nama tidak sah di registry'; klaim /list 'tidak diperiksa (nama tidak sah)' cocok dengan master/src/list.ts. CLAUDE.md tidak perlu diubah menurut aturannya sendiri.
  note: withNameRule tidak menutup bacaan access.json di langkah kedua /revoke (askUser di picker.ts); hanya cek di picker.handle yang menjaganya. Dengan kedua cek pemilih dibuang, user_id umpan tampil sebagai tombol (tidak ditulis). Tidak terjangkau di kode ini; tindak lanjut F1.
  note: tes 'pekerjaan perintah ... walau pemilih meloloskannya' menguji jalur diketik, bukan tombol; kriteria dibuktikan cara lain. picker-process.test.ts tidak diulang reviewer (soket tmux terlalu panjang di TMPDIR scratchpad). Tidak ada skrip/CI lain di repo untuk cek tambahan.

## Follow-ups
- F1 [ticketed] Langkah kedua /revoke di pemilih (askUser di master/src/picker.ts) membaca access.json lewat readAccess(dataDir, bot.name) tanpa lewat withNameRule; yang melindunginya hanya cek isBotName di picker.handle. Dibuktikan reviewer: kalau saringan di ask dan penolakan di handle dibuang (withNameRule utuh), menekan '../luar' untuk /revoke menampilkan user_id dari access.json di luar bots/ sebagai tombol (berkasnya tidak ditulis, /access tetap dijawab cara pakai). docs/master-bot.md menyebut aturan nama dijaga dua lapis; untuk bacaan ini hanya satu lapis. Perbaikan: askUser (atau readAccess sendiri) menolak nama yang tidak lolos NAME_RULE, plus tes yang membuang lapis pemilih.
  → 261115213701

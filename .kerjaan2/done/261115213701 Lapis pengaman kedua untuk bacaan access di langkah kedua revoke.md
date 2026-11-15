---
type: task
priority: low
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 21:37
---

## Background

Tiket 261115210901 membuat tombol pemilih bot di master-bot menolak nama bot yang tidak sah dari `registry.json` (misalnya `../luar` di registry yang diedit tangan), supaya `/access` dan `/revoke` lewat tombol tidak bisa menyentuh `access.json` di luar folder `bots/`. Dokumentasi menyebut aturan nama dijaga dua lapis: di pemilih dan di pekerjaan perintahnya.

Reviewer tiket itu menemukan satu bacaan yang hanya dijaga satu lapis: langkah kedua `/revoke` lewat tombol (menampilkan user_id yang punya akses) membaca `access.json` bot yang dipilih tanpa melewati pengecekan nama bersama. Yang menjaganya hanya pengecekan di pemilih. Reviewer membuktikan di salinan: kalau kedua pengecekan di pemilih dibuang, menekan `../luar` untuk `/revoke` menampilkan user_id dari `access.json` di luar `bots/` sebagai tombol (berkasnya tidak ditulis).

Di kode sekarang celah itu tidak terjangkau. Ini soal ketahanan kalau kode pemilih berubah nanti, dan kalimat dokumentasi yang tidak tepat.

Keputusan pemilik (2026-11-15): dibuatkan tiket dan dikerjakan sekarang.

## Request

Bacaan `access.json` di langkah kedua `/revoke` lewat tombol menolak nama bot yang tidak sah dengan pengaman sendiri, tidak bergantung pada pengecekan di pemilih, dan dokumentasi menggambarkan lapis pengaman apa adanya.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.


## Done when

- [x] Langkah kedua `/revoke` lewat tombol tidak membaca `access.json` untuk nama bot yang tidak lolos aturan nama, juga kalau pengecekan di pemilih tidak ada; dibuktikan dengan tes yang melewati atau mematikan lapis pemilih dan memakai berkas umpan di luar `bots/`.
- [x] Tidak ada bacaan atau tulisan `access.json` lain di master-bot yang bisa dipanggil dengan nama bot tidak sah tanpa pengecekan nama sendiri; hasil pemeriksaannya dicatat di tiket.
- [x] `/revoke`, `/allow`, dan `/access` untuk bot bernama sah, baik diketik maupun lewat tombol, bekerja seperti sekarang.
- [x] Dokumentasi proyek menyebut dengan tepat di mana aturan nama dijaga.
- [x] Seluruh tes tetap lulus.

## Out of scope

- Perlakuan khusus untuk nama `master`.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Handoff
readAccess, writeAccess, dan accessPath di master/src/allow.ts kini menolak nama bot yang tidak lolos NAME_RULE sebelum path dibentuk (readAccess mengembalikan alasan BAD_NAME_REASON, writeAccess/accessPath melempar error; changeAccess mengembalikan kind error). Alasannya: langkah kedua /revoke lewat tombol (askUser di picker.ts) membaca access.json tanpa withNameRule, jadi dulu hanya dijaga pemilih. picker.ts mencatat penolakan itu tanpa menulis namanya. Jangan dirusak: nama sah (termasuk master) tetap dibaca dan ditulis seperti dulu; pemanggil baru access.json harus lewat fungsi-fungsi ini, jangan membentuk path sendiri. Dokumentasi di docs/master-bot.md.

## Review
- 2026-11-15 standard, round 1, at ed38e40: passed.
  1: Salinan dengan kedua cek pemilih dibuang: di main /revoke lalu '../luar' menampilkan tombol 8002 dari umpan di luar bots/; di cabang dijawab 'access.json tidak dibaca', tanpa tombol, umpan utuh. Pengaman allow.ts dibuang: 34 tes gagal, termasuk 18 tes baru.
  2: grep semua pemakai access.json: allow.ts menolak sendiri (dipakai bot.ts, picker.ts, list.ts); register.ts, launch.ts, start-cli.ts cek nama sendiri. Dijalankan dengan 4 nama tidak sah: launchBot failed, accessPath melempar, start-cli keluar 2, folder umpan kosong. Tercatat di klaim butir 2 dan docs.
  3: Skrip sama di salinan cabang dan main untuk 'master', nama 32 karakter, 'pn-a': /access, /allow, /revoke diketik dan lewat tombol, /list, /register. Panggilan API, log, dan berkas akhir identik (diff kosong). Tes allow, picker, list, register, proses: 0 gagal.
  4: docs/master-bot.md kini menyebut tiga tempat (pemilih, withNameRule, fungsi access.json di allow.ts) dan langkah kedua /revoke yang tidak lewat withNameRule; balasan dan log yang dikutip sama dengan hasil uji. Tidak ada sisa 'dua lapis'.
  5: Tidak diulang, sesuai brief (bun test lulus pada isi yang sama, 135ec55a95). Tes terkait di salinan: 487 dan 285 lulus, 0 gagal.
  note: Tes lama yang diganti menguji keadaan yang kini tak terjangkau (pertanyaan kedua tidak tampil untuk nama tidak sah); penggantinya lebih kuat. Penolakan handle untuk langkah 'user' bernama tidak sah tidak lagi punya tes sendiri.
  note: Repo tidak punya lint/CI selain bun test. Uji di scratchpad, HOME dan BOT_SQUAD_HOME sementara, tanpa symlink; sudah dihapus.

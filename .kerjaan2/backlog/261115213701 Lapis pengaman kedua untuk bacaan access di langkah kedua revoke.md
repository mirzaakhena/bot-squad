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

- [ ] Langkah kedua `/revoke` lewat tombol tidak membaca `access.json` untuk nama bot yang tidak lolos aturan nama, juga kalau pengecekan di pemilih tidak ada; dibuktikan dengan tes yang melewati atau mematikan lapis pemilih dan memakai berkas umpan di luar `bots/`.
- [ ] Tidak ada bacaan atau tulisan `access.json` lain di master-bot yang bisa dipanggil dengan nama bot tidak sah tanpa pengecekan nama sendiri; hasil pemeriksaannya dicatat di tiket.
- [ ] `/revoke`, `/allow`, dan `/access` untuk bot bernama sah, baik diketik maupun lewat tombol, bekerja seperti sekarang.
- [ ] Dokumentasi proyek menyebut dengan tepat di mana aturan nama dijaga.
- [ ] Seluruh tes tetap lulus.

## Out of scope

- Perlakuan khusus untuk nama `master`.

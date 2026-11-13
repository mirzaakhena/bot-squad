---
type: feature
priority: low
lane: strict
labels: []
blocked_by: []
related: []
touches: [master/src/bot.ts, master/src/access-admin.ts, master/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Saat ini setiap bot hanya melayani pemilik. Pemilik ingin bisa mengizinkan orang lain memakai bot tertentu saja (CLAUDE.md, bagian Pengguna). Bot berjalan dengan izin bebas, jadi siapa pun yang diizinkan bisa menyuruh bot menjalankan apa saja di server.

## Request

Pemilik bisa menambah dan mencabut akses orang lain ke satu bot tertentu dari master-bot, tanpa memberi mereka akses ke master-bot atau bot lain.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] /allow <nama> <user_id> membuat orang itu bisa mengobrol dengan bot itu saja; bot lain dan master-bot tetap menolaknya.
- [ ] /revoke <nama> <user_id> mencabut akses itu, dan pesan orang itu setelahnya diabaikan.
- [ ] Pemilik tidak bisa mencabut aksesnya sendiri dari bot.
- [ ] Ada cara melihat siapa saja yang punya akses ke sebuah bot.
- [ ] Balasan /allow mengingatkan bahwa orang itu bisa menjalankan perintah apa pun di server lewat bot.
- [ ] Dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [blocking] Cara melihat siapa saja yang punya akses ke sebuah bot? Opsi A (rekomendasi): perintah /access <nama> yang menampilkan daftar user_id di allowFrom bot itu, pemilik ditandai, dan blok yang sama ditambahkan singkat di /list (jumlah orang). Opsi B: hanya /access <nama>. Opsi C: hanya lewat /list (satu baris per bot dengan semua user_id).
- Q2 [blocking] Orang yang diizinkan memakai bot juga bisa memakai perintah plugin di chat bot itu (/context menampilkan kuota akun Claude pemilik, /status). Opsi A (rekomendasi): ya, sama dengan pemilik, karena mereka toh bisa menjalankan apa saja di server lewat bot, jadi menyembunyikan kuota tidak melindungi apa pun; balasan /allow menyebutnya. Opsi B: /context dan /status hanya untuk pemilik (perlu ubah plugin/context.ts dan plugin/server.ts). Opsi C: tunda keputusan, tiket ini tidak menyentuh plugin dan perilaku sekarang (semua allowFrom) dicatat di CLAUDE.md.

## Assumptions
- A1 [unseen] access.json ditulis atomik (berkas sementara + rename, 0600) dan semua kolom lain dipertahankan; berlaku tanpa restart karena plugin membaca access.json setiap pesan. Penting: plugin memindahkan access.json yang rusak dan kembali ke dmPolicy pairing, jadi penulisan setengah jadi tidak boleh terjadi
  Why: plugin/server.ts readAccessFile/saveAccess
  If wrong: -
- A2 [unseen] user_id harus bilangan bulat positif; /allow untuk ID yang sudah ada dan /revoke untuk ID yang tidak ada dijawab tanpa mengubah berkas; bot harus terdaftar, status apa pun (juga stopped); dmPolicy tetap allowlist
  Why: Validasi input dan idempoten, seperti /stop
  If wrong: Tolak bot yang tidak aktif

## Decisions
- Lane strict: memberi orang lain akses ke bot yang berjalan bebas izin di server
- Tidak solo dan tidak menunggu: ketiga tiket perintah master-bot (261112225303, 261112225306, 261112225307) sama-sama menambah COMMANDS dan handler di master/src/bot.ts serta CLAUDE.md, tetapi tidak saling membaca hasilnya; berjalan berdampingan, merge queue menyelesaikan bentrok

---
type: feature
priority: low
lane: strict
labels: []
blocked_by: [261112225302]
related: []
touches: [master/src/bot.ts, master/src/delete.ts, master/src/stop.ts, master/src/registry.ts, master/src/busy.ts, master/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Bot yang tidak dipakai lagi saat ini hanya bisa dihapus dengan mengedit daftar bot dan menghapus foldernya secara manual di server, seperti yang dilakukan pemilik untuk uji-03.

## Request

Pemilik bisa menghapus sebuah bot dari master-bot. Karena tidak bisa dibatalkan, penghapusan harus dikonfirmasi lebih dulu, dan hasil kerja bot di workspace tidak langsung hilang.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] /delete <nama> meminta konfirmasi lewat tombol sebelum melakukan apa pun; tanpa konfirmasi tidak ada yang berubah.
- [ ] Setelah dikonfirmasi, bot dimatikan, dihapus dari daftar bot, dan foldernya tidak lagi berada di tempat bot aktif.
- [ ] Workspace bot diarsipkan, tidak dihapus permanen; balasan menyebut di mana arsipnya.
- [ ] Token bot tidak ikut tersimpan di arsip.
- [ ] Nama itu bisa didaftarkan lagi setelah dihapus.
- [ ] Dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [blocking] Bentuk arsip /delete? Opsi A (rekomendasi): seluruh folder bots/<nama> dipindah (rename, satu langkah) ke ~/.bot-squad/archive/<nama>-<YYYYMMDD-HHMMSS>/ setelah state/.env dihapus; workspace, access.json, dan plugin.log ikut tersimpan, arsip tidak pernah dihapus otomatis. Opsi B: hanya workspace yang diarsipkan, folder state dihapus permanen. Opsi C: dikemas jadi satu berkas .tar.gz di archive/ lalu folder asli dihapus.

## Assumptions
- A1 [unseen] Tombol konfirmasi berisi Hapus dan Batal, sekali pakai, berlaku 5 menit; tombol kedaluwarsa atau sudah dipakai dijawab 'kedaluwarsa' tanpa mengubah apa pun; hanya callback dari pemilik di chat pribadinya (isOwnerUpdate)
  Why: Pagar konfirmasi mirza-bots dan aturan pemilik saja
  If wrong: Ubah masa berlaku
- A2 [unseen] Penghapusan memakai BotLocks yang sama (label 'dihapus'), langkah henti dari stop.ts; kalau bot tidak bisa dihentikan bersih, penghapusan dibatalkan dan registry serta folder tidak berubah; entri registry dihapus lewat writeRegistry setelah folder dipindah
  Why: Sama dengan /restart yang batal kalau bot lama tidak mati bersih (Q2 261112225302)
  If wrong: Hapus walau tersisa proses
- A3 [unseen] Transkrip ~/.claude/projects dan trust di ~/.claude.json tidak disentuh; token di BotFather tetap berlaku (balasan menyarankan revoke di @BotFather kalau perlu)
  Why: Di luar folder bot-squad; mencabut token butuh BotFather
  If wrong: Tambah pembersihan transkrip

## Decisions
- Lane strict: menghapus data bot dan entri registry, tidak bisa dibatalkan kalau salah
- Tidak solo dan tidak menunggu: ketiga tiket perintah master-bot (261112225303, 261112225306, 261112225307) sama-sama menambah COMMANDS dan handler di master/src/bot.ts serta CLAUDE.md, tetapi tidak saling membaca hasilnya; berjalan berdampingan, merge queue menyelesaikan bentrok

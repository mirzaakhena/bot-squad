---
type: bug
priority: low
lane: standard
labels: []
blocked_by: []
related: [261112225306]
touches: [master/src/bot.ts, master/src/delete.ts, master/test/delete.test.ts, master/test/revive.test.ts, CLAUDE.md]
created: 2026-11-13 19:07
---

## Background

Perintah hapus bot di master-bot (tiket 261112225306) menghentikan bot lebih dulu, lalu memindahkan foldernya ke arsip dan menghapus catatannya dari daftar bot. Selama langkah-langkah itu, status bot di daftar tidak diubah menjadi "dihentikan". Reviewer tiket 261112225306 mencatat celah ini sebagai temuan yang tidak memblokir.

## How to reproduce

1. Daftarkan sebuah bot yang statusnya aktif.
2. Jalankan perintah hapus untuk bot itu dan tekan tombol konfirmasi Hapus.
3. Matikan paksa master-bot tepat setelah bot dihentikan, sebelum foldernya diarsipkan.
4. Nyalakan master-bot lagi: bot yang sedang dihapus ikut dinyalakan ulang otomatis.

## Request

Bot yang sedang dihapus tidak pernah dinyalakan ulang otomatis kalau master-bot berhenti mendadak di tengah penghapusan.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik), termasuk `status.json` bot yang sedang berjalan.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`; soketnya boleh di `/tmp/k2-<id tiket>-*` dan dihapus sesudahnya. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Kalau master-bot mati mendadak setelah bot dihentikan tetapi sebelum diarsipkan, bot itu tidak dinyalakan lagi saat master-bot menyala, dan ringkasan penyalaan menyebutnya sebagai bot yang dihentikan.
- [ ] Status 'stopped' dicatat di registry sebelum bot dihentikan; kalau penulisan status gagal, penghapusan batal sebelum apa pun disentuh dan laporan mengatakannya (Q1).
- [ ] Kalau bot tidak bisa dihentikan dengan bersih, penghapusan tetap dibatalkan seperti sekarang, status tetap 'stopped', dan laporan menyarankan /restart <nama> untuk menyalakan lagi atau /delete <nama> untuk mencoba lagi (Q1).
- [ ] Perilaku hapus yang lain (konfirmasi, arsip, token dihapus) tidak berubah, dan tes yang ada tetap lulus.
- [ ] Ada tes yang gagal di kode lama untuk skenario mati mendadak itu.
- [ ] Catatan proyek (CLAUDE.md) menjelaskan urutan status saat bot dihapus.

## Out of scope

- Menggulung balik langkah hapus yang gagal di tengah (asumsi A5 tiket 261112225306 sudah dikonfirmasi pemilik).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Urutan status saat /delete? (a) 'stopped' dicatat sebelum bot dihentikan (seperti /stop); kalau penulisan status gagal, penghapusan batal sebelum apa pun disentuh; kalau bot tidak bersih dihentikan, penghapusan batal, status tetap 'stopped', dan laporan menyarankan /restart <nama> atau /delete <nama> lagi. (b) Seperti (a), tetapi kalau tidak bersih status dikembalikan ke nilai sebelumnya. (c) Seperti (a), tetapi kalau penulisan status gagal penghapusan tetap lanjut (seperti /stop). Rekomendasi (a): niat menghapus berarti bot tidak boleh hidup otomatis lagi, dan tanpa status tercatat celah crash tiket ini tetap terbuka.
  → Catat 'stopped' dulu (Recommended) = (a) (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Kalau master-bot mati setelah folder diarsipkan tetapi sebelum entri registry dihapus, entri yang tersisa berstatus 'stopped' sehingga tidak dinyalakan, dan /delete <nama> lagi menyelesaikannya seperti sekarang; teks ringkasan penyalaan otomatis ('dihentikan pemilik') dipakai apa adanya
  Why: Perilaku 'langkah gagal di tengah' dan ringkasan revive.ts sudah dikonfirmasi di 261112225306 dan 261112225304
  If wrong: Tambahkan label khusus 'sedang dihapus' di ringkasan

## Decisions
- Lane standard: urutan status registry saat hapus; arsip tetap ada, tidak ada data yang hilang permanen karena perubahan ini
- Tidak solo dan tidak menunggu: bentrok berkas dengan 261113194401 (delete.test.ts) hanya tumpang tindih berkas, diselesaikan antrean merge

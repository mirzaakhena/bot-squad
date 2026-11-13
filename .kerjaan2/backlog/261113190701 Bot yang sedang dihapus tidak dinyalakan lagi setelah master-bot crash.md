---
type: bug
priority: low
lane: standard
labels: []
blocked_by: []
related: [261112225306]
touches: []
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

## Done when

- [ ] Kalau master-bot mati mendadak setelah bot dihentikan tetapi sebelum diarsipkan, bot itu tidak dinyalakan lagi saat master-bot menyala, dan ringkasan penyalaan menyebutnya sebagai bot yang dihentikan.
- [ ] Kalau bot tidak bisa dihentikan dengan bersih, penghapusan tetap dibatalkan seperti sekarang, dan status bot sesudahnya tercatat jelas di daftar bot.
- [ ] Perilaku hapus yang lain (konfirmasi, arsip, token dihapus) tidak berubah, dan tes yang ada tetap lulus.
- [ ] Ada tes yang gagal di kode lama untuk skenario mati mendadak itu.
- [ ] Catatan proyek (CLAUDE.md) menjelaskan urutan status saat bot dihapus.

## Out of scope

- Menggulung balik langkah hapus yang gagal di tengah (asumsi A5 tiket 261112225306 sudah dikonfirmasi pemilik).

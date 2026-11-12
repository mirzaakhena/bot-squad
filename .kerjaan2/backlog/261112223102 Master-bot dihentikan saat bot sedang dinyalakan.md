---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112214001]
touches: []
created: 2026-11-12 22:31
---

## Background

Kalau master-bot dihentikan (Ctrl+C) saat sebuah bot masih dalam proses dinyalakan, yang bisa memakan waktu sampai 90 detik, master langsung keluar tanpa menunggu proses itu. Akibatnya log tidak mencatat bahwa laporan ke pemilik tidak terkirim, dan status bot di daftar bot tertinggal "registered", bukan "active" atau "failed". Ditemukan reviewer tiket 261112214001.

## Request

Menghentikan master-bot di tengah penyalaan bot tidak boleh meninggalkan status yang menyesatkan. Pemilik bisa tahu dari log dan daftar bot apa yang terjadi pada bot itu.

## Done when

- [ ] Setelah master-bot dihentikan di tengah penyalaan, status bot di daftar bot tidak lagi tertinggal "registered" tanpa penjelasan.
- [ ] Log master mencatat bahwa penyalaan bot itu terputus dan laporannya tidak terkirim.
- [ ] Master-bot tetap berhenti dalam waktu singkat; berhenti tidak ditunda sampai penyalaan selesai.
- [ ] Dibuktikan dengan tes otomatis yang menjalankan proses master sungguhan, bukan hanya fungsi di dalamnya.

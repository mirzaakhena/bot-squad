---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: [261112184705, 261112184702, 261112184703]
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

Setelah bot terdaftar, master-bot harus menyalakannya sebagai sesi Claude Code di tmux dengan cara yang terbukti di spike. Telegram hanya mengizinkan satu penerima pesan per token, jadi satu bot tidak boleh berjalan dua kali. Sesi juga bisa macet di prompt saat start. Kalau itu terjadi, pemilik harus tahu, bukan menunggu tanpa kabar.

## Request

Registrasi yang berhasil langsung menyalakan bot. Master-bot memastikan bot benar-benar siap, lalu melapor ke pemilik apakah bot sudah aktif atau gagal, beserta alasannya.

## Done when

- [ ] (owner) Setelah registrasi, pemilik menerima pesan "aktif" dari master-bot, dan bot baru langsung membalas saat diajak bicara.
- [ ] Kalau sesi tidak siap dalam batas waktu tertentu, pemilik menerima pesan gagal yang menyertakan potongan isi layar sesi tersebut.
- [ ] Bot yang sudah berjalan tidak bisa dinyalakan untuk kedua kalinya.
- [ ] Bot yang gagal menyala tetap tercatat dengan status gagal, sehingga nanti bisa dicoba lagi.
- [ ] Sesi bot berjalan di folder kerjanya sendiri dan memakai folder state miliknya sendiri.
- [ ] Logika menentukan bot siap, gagal, atau sudah berjalan dibuktikan dengan tes otomatis.

## Out of scope

- Perintah /restart dan /stop.
- Menghidupkan ulang bot secara otomatis setelah reboot atau crash.

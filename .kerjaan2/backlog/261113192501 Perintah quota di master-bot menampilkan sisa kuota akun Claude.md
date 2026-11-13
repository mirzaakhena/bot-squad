---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112225308]
touches: []
created: 2026-11-13 19:25
---

## Background

Semua bot memakai satu akun Claude milik pemilik. Riset tiket 261112225308 menyimpulkan bahwa sisa kuota akun bisa dibaca tanpa kredensial akun Claude. Sumbernya data batas pemakaian (5 jam dan 7 hari) yang sudah ditangkap setiap bot untuk `/context` di chat bot. Data itu berlaku untuk seluruh akun, hanya berubah saat ada panggilan ke Claude, dan bisa selisih sekitar 1 poin dari layar /usage. Detailnya ada di bagian "Membaca kuota akun Claude" di CLAUDE.md.

## Request

Pemilik bisa melihat sisa kuota akun Claude dari master-bot dengan satu perintah, tanpa harus membuka chat bot tertentu.

## Done when

- [ ] Perintah /quota di master-bot menampilkan pemakaian 7 hari (dan 5 jam kalau datanya ada): persen terpakai, sisa, kapan pulih, umur data, dan dari bot mana data itu diambil.
- [ ] Data yang dipakai adalah yang paling baru di antara semua bot terdaftar.
- [ ] Kalau belum ada bot yang punya data, balasannya mengatakan itu dengan jelas, tanpa angka.
- [ ] /quota hanya membaca: tidak ada berkas, sesi, atau proses yang diubah, dan tidak memakai kredensial akun Claude.
- [ ] Hanya pemilik yang dilayani, sama seperti perintah master-bot lain; /quota muncul di menu master-bot.
- [ ] Ada tes otomatis untuk ketiga keadaan (data ada, data dari beberapa bot dengan umur berbeda, tidak ada data), dan CLAUDE.md menjelaskan perintahnya.
- [ ] (owner) Pemilik mengetik /quota di master-bot dan angkanya masuk akal dibanding /context di chat bot.

## Out of scope

- Endpoint usage OAuth dan kredensial akun Claude (keputusan pemilik di 261112225308 Q1).
- Rincian per model.

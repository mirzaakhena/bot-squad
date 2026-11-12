---
type: task
priority: high
lane: standard
labels: []
blocked_by: [261112184701]
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

Banyak bot akan berjalan di satu mesin. Masing-masing bot harus membaca token dan daftar izinnya sendiri dari folder state miliknya. Plugin sebenarnya bisa diarahkan ke folder state yang berbeda lewat variabel lingkungan, tetapi ada catatan di kode plugin yang menyiratkan bahwa variabel lingkungan mungkin tidak diteruskan ke proses plugin. Kalau memang tidak diteruskan, semua bot akan membaca state bawaan yang sama.

Ada satu masalah lagi. Setiap kali plugin dinyalakan, ia memasang paket di folder plugin yang dipakai bersama semua bot. Kalau beberapa bot dinyalakan bersamaan, pemasangan paket itu bisa saling bertabrakan.

Untuk spike ini dibutuhkan dua token bot uji dari pemilik.

## Request

Buktikan bahwa dua bot bisa berjalan bersamaan di satu mesin dan benar-benar terpisah: masing-masing memakai token dan daftar izinnya sendiri, dan menyalakan keduanya sekaligus tidak membuat salah satunya gagal. Catat caranya.

## Done when

- [ ] CLAUDE.md mencatat apakah pengaturan folder state per bot benar-benar sampai ke plugin, dan cara yang dipakai kalau ternyata tidak sampai.
- [ ] CLAUDE.md mencatat cara menangani pemasangan paket plugin supaya beberapa bot bisa dinyalakan bersamaan dengan aman.
- [ ] Dua bot dinyalakan pada saat yang hampir bersamaan, dan keduanya sampai ke kondisi siap.
- [ ] (owner) Pemilik mengirim pesan ke tiap bot, dan masing-masing membalas dari sesinya sendiri tanpa pesan nyasar ke bot lain.
- [ ] Mematikan satu bot tidak mengganggu bot yang lain.

## Out of scope

- Menulis kode master-bot.
- Mengganti nama plugin.

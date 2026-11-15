---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112230309, 261113230601]
touches: []
created: 2026-11-13 23:54
---

## Background

Claude Code punya fitur bawaan untuk berkirim pesan antarsesi di satu mesin. Temuan tiket 261112230309 (pemeriksaan statis, belum diuji; lihat CLAUDE.md bagian "Bot berkirim pesan ke bot lain") menunjukkan fitur ini sudah aktif di sesi bot yang dinyalakan master-bot. Bot dan sesi Claude milik pemilik juga tercatat di daftar sesi yang sama. Akibatnya bot bisa melihat dan mengirim pesan ke sesi pemilik, dan sebaliknya. Semua bot berjalan bebas izin, dan sebagian sesi pemilik juga.

Pemilik memutuskan (2026-11-13) untuk menerima keadaan ini sementara sebagai risiko yang tercatat, dan meminta riset cara memisahkannya.

Cara yang sudah disebut tetapi belum diuji: folder konfigurasi Claude terpisah untuk bot (kemungkinan bot kehilangan login, seperti yang terjadi dengan HOME sementara), dan flag `--restricted` (mematikan pesan antarsesi sepenuhnya, termasuk antarbot).

## Request

Ketahui apakah dan bagaimana sesi bot bisa dipisahkan dari sesi Claude pemilik untuk pesan antarsesi, tanpa bot kehilangan login akun Claude, supaya pemilik bisa memutuskan.

## Done when

- [ ] CLAUDE.md mencatat apakah bot benar-benar bisa melihat atau mengirim ke sesi pemilik, dan sebaliknya, dengan bukti atau tanda jelas bahwa belum dibuktikan.
- [ ] CLAUDE.md mencatat setiap cara pemisahan yang dicoba atau ditemukan, dan untuk masing-masing: apakah bot tetap login, apakah bot masih bisa saling berkirim pesan, dan apa yang harus diubah di cara menyalakan bot.
- [ ] Ada rekomendasi untuk pemilik, beserta dampaknya pada rancangan bot berkirim pesan ke bot lain (261113230601).
- [ ] Tidak ada pengaturan Claude milik pemilik yang diubah, dan tidak ada pesan yang dikirim ke sesi pemilik atau bot pemilik.

## Out of scope

- Membangun pemisahan itu; itu tiket terpisah setelah pemilik memilih.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Decisions
- 2026-11-15 moved to cancel: Pemilik (2026-11-15): komunikasi antar bot ditutup, tiket ini ikut dibatalkan. Pengamatan hari itu: ListAgents di bot-03 hanya menampilkan bot-01 dan bot-02 (bukan sesi pemilik), dan ListAgents di sesi pemilik hanya menampilkan sesi pemilik lain (bukan bot). Hanya daftar yang diamati; kirim langsung lintas kelompok tidak diuji.

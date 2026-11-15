---
type: feature
priority: low
lane: strict
labels: []
blocked_by: [261112230309]
related: [261112230309, 261112230308]
touches: [master/src/launch.ts, plugin/server.ts, CLAUDE.md]
created: 2026-11-13 23:06
---

## Background

Tahap 2 dari 261112230309 (dipecah planner 2026-11-13). Tiket ini hanya boleh dikerjakan setelah 261112230309 selesai dan pemilik menyetujui rancangan di CLAUDE.md. Keputusan pemilik di Background 261112230309 tetap berlaku: alamat = nama bot; session-id terkini dicari dari nama bot setiap kali; sesi Claude tidak dinamai sesuai nama bot; kirim lewat mekanisme bawaan Claude Code; semua bot terdaftar boleh saling kirim.

Sebelum tiket ini masuk todo, planner harus memperbarui Done when sesuai rancangan yang disetujui (mekanisme, sumber session-id, cara penolakan), dan aturan uji 261112230309 (tanpa `~/.bot-squad`, HOME/BOT_SQUAD_HOME salinan tanpa symlink, server tmux terpisah, tidak mengirim ke sesi pemilik, tanpa token asli, batas sesi dan giliran) disalin ke sini.

Lane strict: setiap bot berjalan bebas izin, sehingga pesan antarbot bisa menjadi jalan menyuruh bot lain menjalankan apa saja.

## Request

Sebuah bot bisa mengirim pesan ke bot lain milik pemilik hanya dengan menyebut nama bot tujuan, dan menerima jawabannya, tetap berfungsi setelah bot tujuan dinyalakan ulang atau memulai percakapan baru.

## Done when

- [ ] Nama bot dipetakan ke session-id terkininya setiap kali dibutuhkan, dan pemetaan itu tetap benar setelah bot dinyalakan ulang atau memulai percakapan baru.
- [ ] Bot bisa mengirim pesan ke bot lain hanya dengan menyebut nama bot, dan menerima jawaban.
- [ ] Mengirim ke nama yang tidak terdaftar atau ke bot yang sedang mati memberi jawaban yang jelas ke bot pengirim, tanpa pesan hilang diam-diam.
- [ ] Semua bot terdaftar boleh saling mengirim; pesan dari luar bot terdaftar ditolak.
- [ ] Pesan antarbot tidak berputar tanpa akhir (misalnya balasan tidak boleh meminta balasan lagi).
- [ ] CLAUDE.md diperbarui dari rancangan menjadi perilaku yang dibangun.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Decisions
- Lane strict: pesan antarbot ke sesi bebas izin. Menunggu 261112230309 (butuh hasil spike dan rancangan yang disetujui pemilik); tetap di backlog sampai itu
- 2026-11-15 moved to cancel: Pemilik (2026-11-15): batalkan; sudah bisa dilakukan manual: bot tujuan diminta menyebut session-id-nya, lalu bot pengirim diminta menghubungi bot tujuan dengan session-id itu.

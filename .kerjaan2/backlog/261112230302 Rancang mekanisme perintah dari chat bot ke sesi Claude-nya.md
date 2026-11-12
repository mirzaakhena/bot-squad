---
type: task
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

Pemilik ingin beberapa perintah diketik langsung di chat bot (mirza_00X), bukan di master-bot, dan berlaku untuk sesi Claude bot itu: /new, /rename, /context, /interrupt, dan meneruskan slash Claude Code lainnya. Saat ini semua yang diketik di chat bot diteruskan ke Claude sebagai pesan biasa, kecuali /start, /help, dan /status bawaan plugin. Plugin berjalan di dalam pane tmux bot itu sendiri, jadi secara prinsip ia bisa mengetik ke sesi Claude-nya, tetapi belum ada yang mencobanya.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin. Pemilik menekankan bahwa mekanisme wrapper di sana belum ada padanannya di bot-squad dan butuh penyesuaian.

## Request

Putuskan dan buktikan satu cara yang aman agar perintah dari chat bot bisa sampai ke sesi Claude bot itu sebagai perintah (bukan sebagai pesan biasa), sebagai dasar untuk tiket-tiket perintah chat bot.

## Done when

- [ ] CLAUDE.md mencatat mekanisme yang dipilih, alasannya, dan perbandingannya dengan mekanisme mirza-bots.
- [ ] Ada bukti nyata dengan bot uji bahwa satu perintah sederhana dari chat bot dijalankan oleh sesi Claude-nya sebagai slash command.
- [ ] CLAUDE.md mencatat risiko yang harus dijaga tiap perintah: perintah yang datang saat Claude sedang bekerja, slash interaktif yang bisa membuat sesi menggantung, dan perintah basi yang tertunda.
- [ ] Hanya pengirim yang diizinkan di bot itu yang bisa memicu perintah.

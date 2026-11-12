---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261112230302]
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

Sesi Claude yang bernama lebih mudah dikenali kelak (mis. saat memilih sesi lama). Di mirza-bots, /rename <nama> langsung memberi nama, dan /rename tanpa nama meminta Claude sendiri mengusulkan nama berdasarkan isi percakapan.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Pemilik bisa memberi nama sesi bot dari chat bot, atau meminta Claude memberi nama yang sesuai.

## Done when

- [ ] /rename <nama> memberi nama sesi bot itu dan mengonfirmasinya di chat.
- [ ] /rename tanpa nama membuat Claude mengusulkan dan memasang nama yang sesuai isi percakapan.
- [ ] Hanya pengirim yang diizinkan yang bisa memakainya.
- [ ] (owner) Pemilik mengganti nama sesi bot uji dan melihat nama itu di sesi tmux-nya.

---
type: feature
priority: high
lane: standard
labels: []
blocked_by: [261112225302]
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Setelah server reboot atau crash, semua sesi bot mati. Daftar bot tetap mencatatnya aktif, tetapi tidak ada yang menyalakannya lagi. Ini concern "ketahanan" di CLAUDE.md.

## Request

Saat master-bot menyala, ia mencocokkan daftar bot dengan sesi yang benar-benar hidup, lalu menyalakan ulang bot yang seharusnya hidup. Bot yang sengaja dihentikan pemilik tidak ikut dinyalakan.

## Done when

- [ ] Saat master-bot menyala, setiap bot yang seharusnya hidup tetapi tidak berjalan dinyalakan ulang.
- [ ] Bot yang sengaja dihentikan pemilik dan bot yang sudah berjalan tidak disentuh.
- [ ] Pemilik menerima satu pesan ringkasan: bot mana yang dinyalakan ulang, mana yang gagal, dan mana yang dibiarkan.
- [ ] Bot yang gagal dinyalakan ulang tidak menghalangi bot lain.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik mematikan semua sesi bot, menyalakan ulang master-bot, dan bot-bot itu hidup kembali.

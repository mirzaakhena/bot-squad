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

Pemilik sering ingin memulai topik baru dengan konteks bersih tanpa mematikan bot. Di mirza-bots, /new [nama] menjalankan /clear lalu /rename, dan tanpa nama sesi diberi nama sementara berbasis jam (mis. idle-2226). Tanpa ini konteks terus menumpuk dan kuota cepat habis.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Pemilik bisa mengetik /new atau /new <nama> di chat sebuah bot untuk memulai percakapan baru di sesi bot itu.

## Done when

- [ ] /new di chat bot mengosongkan konteks sesi Claude bot itu; bot tetap hidup dan menjawab pesan berikutnya tanpa ingat percakapan sebelumnya.
- [ ] /new <nama> juga memberi nama sesi itu; tanpa nama, sesi diberi nama sementara yang mudah dikenali.
- [ ] Pengirim mendapat konfirmasi di chat bahwa percakapan baru dimulai.
- [ ] Perintah dari pengirim yang tidak diizinkan diabaikan.
- [ ] (owner) Pemilik mengirim /new ke bot uji, lalu bertanya tentang percakapan sebelumnya, dan bot tidak mengingatnya.

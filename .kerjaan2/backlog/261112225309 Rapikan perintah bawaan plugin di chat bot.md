---
type: task
priority: low
lane: light
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Di chat sebuah bot, perintah /start, /help, dan /status dijawab langsung oleh plugin dengan teks soal pairing ("DM me anything — you'll get a 6-char code"). Bot-squad tidak memakai pairing (akses diatur lewat allowlist), jadi teks itu menyesatkan.

## Request

Jawaban bot atas /start, /help, dan /status sesuai cara kerja bot-squad, tanpa instruksi pairing.

## Done when

- [ ] /start dan /help di chat bot menjelaskan bahwa pesan diteruskan ke sesi Claude bot itu, tanpa instruksi pairing.
- [ ] /status di chat bot memberi tahu pengirim apakah ia diizinkan, tanpa menawarkan kode pairing.
- [ ] Orang yang tidak diizinkan tetap tidak mendapat balasan apa pun.
- [ ] (owner) Pemilik mengirim /start ke bot uji dan melihat teks yang baru.

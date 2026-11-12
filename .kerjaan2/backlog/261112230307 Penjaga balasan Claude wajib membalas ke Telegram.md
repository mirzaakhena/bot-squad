---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

Orang yang mengirim pesan membaca Telegram, bukan terminal. Kalau Claude selesai bekerja tanpa memanggil balasan ke Telegram, pengirim hanya melihat diam total yang tidak bisa dibedakan dari bot rusak. mirza-bots memakai hook saat giliran berakhir yang memblokir sekali dan menyuruh Claude membalas dulu.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Setiap pesan dari Telegram selalu mendapat balasan di Telegram, walaupun Claude lupa membalas.

## Done when

- [ ] Kalau giliran Claude berakhir tanpa balasan ke Telegram sejak pesan masuk terakhir, Claude diminta membalas dulu sebelum giliran benar-benar selesai.
- [ ] Penjaga tidak mengganggu giliran yang memang dimulai dari terminal, bukan dari Telegram.
- [ ] Penjaga tidak membuat loop: paling banyak sekali per giliran.
- [ ] Dibuktikan dengan tes otomatis.

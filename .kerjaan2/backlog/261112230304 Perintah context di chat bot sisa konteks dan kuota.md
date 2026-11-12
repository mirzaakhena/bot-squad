---
type: feature
priority: high
lane: standard
labels: []
blocked_by: []
related: [261112225308]
touches: []
created: 2026-11-12 23:03
---

## Background

Pemilik ingin tahu sisa konteks sesi bot dan sisa kuota akun Claude (dipakai bersama semua bot). Di mirza-bots, /context dijawab dari data statusline Claude Code yang ditangkap ke berkas, tanpa mengirim apa pun ke Claude. Di bot-squad, pengaturan tiap bot ditentukan sendiri saat start, jadi statusline bisa dipasang tanpa menggusur milik siapa pun. Data statusline juga memuat batas kuota 5 jam dan 7 hari, sehingga riset 261112225308 kemungkinan besar terjawab di sini.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Pemilik bisa mengetik /context di chat bot dan langsung mendapat sisa konteks sesi itu serta sisa kuota akun, tanpa memakai giliran Claude.

## Done when

- [ ] /context di chat bot membalas persen konteks terpakai dan sisa kuota 5 jam/7 hari beserta waktu pulihnya, tanpa mengirim apa pun ke sesi Claude.
- [ ] Kalau data belum tersedia (sesi baru), balasannya menjelaskan itu, bukan angka kosong atau salah.
- [ ] Statusline milik pemilik di luar bot-squad tidak berubah.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik mengirim /context ke bot uji dan angkanya masuk akal.

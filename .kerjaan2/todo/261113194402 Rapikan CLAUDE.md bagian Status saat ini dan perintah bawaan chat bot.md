---
type: task
priority: medium
lane: light
labels: []
blocked_by: []
related: [261112225309]
touches: [CLAUDE.md]
created: 2026-11-13 19:44
---

## Background

Catatan proyek (CLAUDE.md) dibaca setiap sesi baru. Ada dua bagian yang tidak lagi sesuai dengan keadaan sekarang:

- Bagian "Status saat ini" di akhir berkas sudah usang. Tanggalnya masih 2026-11-12, tertulis "belum ada commit" padahal repo sudah punya banyak commit, dan daftar perintah master-bot berikutnya masih tertulis "list, dst." padahal /list, /stop, /restart, /logs, /allow, /revoke, /access, dan /delete sudah selesai.
- Tiket 261112225309 mengubah /start, /help, dan /status di chat bot (teks Bahasa Indonesia tanpa pairing, hanya dibalas untuk pengirim di allowlist di chat pribadi, apa pun mode aksesnya), tetapi CLAUDE.md belum menjelaskannya.

## Request

CLAUDE.md menggambarkan keadaan proyek yang sebenarnya hari ini, tanpa mengubah kode apa pun.

## Done when

- [ ] Bagian "Status saat ini" bertanggal hari pengerjaan dan mencerminkan pekerjaan yang sudah selesai (termasuk perintah master-bot yang sudah ada) serta yang masih direncanakan sesuai backlog: perintah yang mengetik ke sesi Claude ditunda menunggu rancangan 261112230302, /quota (261113192501), dan perbaikan lain.
- [ ] Ada penjelasan singkat perilaku /start, /help, /status di chat bot: teks Bahasa Indonesia tanpa pairing, hanya dibalas untuk pengirim di allowlist di chat pribadi apa pun mode aksesnya, orang lain tidak dibalas. Tesnya disebut.
- [ ] Prinsip pemilik tercatat: bot-squad hanya mendukung beberapa perintah terpilih, tidak meneruskan semua slash command Claude Code (alasan pembatalan 261112230305).
- [ ] Tidak ada berkas selain CLAUDE.md yang berubah, dan isi bagian lain tidak dihapus atau diubah maknanya.

## Out of scope

- Merapikan atau memendekkan bagian lain CLAUDE.md.

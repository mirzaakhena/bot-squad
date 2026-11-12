---
type: task
priority: medium
lane: standard
labels: []
blocked_by: [261112184701]
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

Plugin di repo ini adalah salinan plugin Telegram resmi dan masih memakai nama "telegram": nama plugin, nama server, perintah skill, dan teks yang ditampilkan semuanya masih bernama telegram. Kalau plugin resmi juga terpasang di mesin yang sama, keduanya akan bentrok dan membingungkan. Commit baseline sudah menyimpan versi aslinya, jadi semua perubahan fork bisa dilihat lewat diff.

## Request

Ganti identitas plugin menjadi "bot-squad" di semua tempat yang terlihat oleh Claude Code dan pengguna, tanpa mengubah perilakunya.

## Done when

- [ ] Claude Code menampilkan plugin ini dengan nama bot-squad, dan perintah skill-nya memakai awalan bot-squad, bukan telegram.
- [ ] Pesan yang ditulis plugin, termasuk pesan error dan instruksi untuk Claude, menyebut bot-squad, bukan plugin Telegram resmi.
- [ ] Plugin bot-squad bisa terpasang di mesin yang juga punya plugin Telegram resmi tanpa saling bentrok.
- [ ] Satu bot uji yang dinyalakan dengan cara dari spike tetap bisa menerima dan membalas pesan setelah rebrand.
- [ ] Cara menyalakan bot yang tercatat di CLAUDE.md diperbarui ke nama baru.
- [ ] Tanda atribusi lisensi upstream tetap ada.

## Out of scope

- Mengubah perilaku plugin, misalnya alur pairing atau cara izin dibaca.

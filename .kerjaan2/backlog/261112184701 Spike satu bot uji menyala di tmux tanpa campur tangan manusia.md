---
type: task
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

Rencananya, setiap bot adalah sesi Claude Code yang berjalan di tmux dengan plugin Telegram milik proyek ini. Sampai sekarang belum ada yang pernah benar-benar mencobanya. Masih ada tiga hal yang belum diketahui:

- Bagaimana cara memuat plugin lokal (plugin yang tidak berasal dari marketplace) supaya aktif sebagai channel Telegram.
- Prompt apa saja yang muncul saat sesi dibuka, misalnya percaya folder, konfirmasi mode bebas izin, dan konfirmasi channel development. Prompt seperti ini bisa membuat sesi macet karena tidak ada orang yang menjawab.
- Bagaimana mencegah prompt tersebut muncul, atau menjawabnya secara otomatis.

Versi Claude Code yang terpasang adalah 2.1.322. Untuk spike ini pemilik menyediakan satu token bot uji dari BotFather. Plugin dipakai apa adanya; rebrand dikerjakan di tiket lain.

## Request

Temukan dan catat satu cara yang terbukti berhasil untuk menyalakan satu bot uji dengan satu perintah non-interaktif di tmux. Bot itu harus langsung bisa diajak bicara lewat Telegram oleh pemilik, tanpa pairing dan tanpa ada yang menekan tombol apa pun di sesi tmux.

## Done when

- [ ] Ada catatan di CLAUDE.md berisi perintah persis untuk menyalakan satu bot, termasuk cara memuat plugin lokal sebagai channel.
- [ ] Catatan itu mendaftar setiap prompt yang muncul saat start, lengkap dengan cara mencegah atau menjawabnya otomatis.
- [ ] Mengikuti catatan itu dari folder kerja yang benar-benar baru, sesi tmux sampai ke kondisi siap tanpa input manusia.
- [ ] (owner) Pemilik mengirim pesan ke bot uji di Telegram dan mendapat balasan dari Claude.
- [ ] (owner) Pesan dari akun Telegram selain pemilik tidak dibalas dan tidak menghasilkan kode pairing.
- [ ] Hal yang tidak berhasil atau masih belum pasti dicatat di bagian concern CLAUDE.md.

## Out of scope

- Menulis kode master-bot.
- Menjalankan lebih dari satu bot.
- Mengganti nama plugin.

---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

master-bot adalah aplikasi biasa, bukan bot Claude, yang menjadi panel kontrol pemilik lewat Telegram. Aplikasi ini belum ada sama sekali. Token master-bot dan ID Telegram pemilik disimpan di luar repo, di folder data bot-squad di home directory.

## Request

Buat aplikasi master-bot paling dasar. Aplikasi ini membaca konfigurasinya dari folder data, hanya menanggapi pemilik, dan menjadi dasar untuk perintah-perintah berikutnya.

## Done when

- [ ] Aplikasi bisa dijalankan dengan satu perintah yang tercatat di CLAUDE.md.
- [ ] Kalau token atau ID pemilik tidak ada, aplikasi berhenti dengan pesan yang jelas tentang apa yang kurang dan di mana harus mengisinya.
- [ ] (owner) Pemilik mengirim /start atau /help ke master-bot dan mendapat daftar perintah.
- [ ] Pesan dari akun Telegram lain sama sekali tidak dibalas. Ini dibuktikan dengan tes otomatis.
- [ ] Token tidak pernah muncul di log atau di balasan.
- [ ] Tidak ada hal yang khusus macOS, sehingga aplikasi juga bisa jalan di Linux.
- [ ] Tes otomatis berjalan lewat perintah tes proyek.

## Out of scope

- Perintah /register dan perintah lain selain bantuan.
- Menjalankan master-bot sebagai service yang otomatis menyala saat boot.

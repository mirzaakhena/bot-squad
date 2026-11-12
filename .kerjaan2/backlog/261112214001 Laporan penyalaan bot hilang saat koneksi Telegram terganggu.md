---
type: bug
priority: high
lane: standard
labels: []
blocked_by: []
related: [261112184706]
touches: []
created: 2026-11-12 21:40
---

## Background

Cek manual tiket 261112184706 (2026-11-12, MacBook pemilik): pemilik mendaftarkan uji-03 lewat master-bot. Pesan "Menyalakan 'uji-03'..." sampai, dan bot benar-benar aktif (registry `active`, sesi tmux dan server plugin hidup). Namun laporan "aktif" tidak pernah sampai ke pemilik. Konsol master mencatat:

```
master-bot: penyalaan 'uji-03': active
master-bot: laporan penyalaan 'uji-03' gagal dikirim: Network request for 'sendMessage' failed!
```

Master tidak mencoba mengirim ulang, sehingga pemilik tidak tahu bot sudah aktif.

Pada waktu yang sama, pesan pertama pemilik ke bot baru ("hallo", 21.34) baru diterima sesi Claude sekitar 21.36. Dugaannya, koneksi ke Telegram sedang terganggu dan plugin menunggu jeda percobaan ulang polling. Ini belum terbukti.

## How to reproduce

1. Jalankan master-bot, lalu daftarkan bot baru dengan /register.
2. Buat pengiriman pesan ke Telegram gagal sesaat (jaringan putus) tepat saat bot selesai menyala.
3. Pesan "aktif" atau "gagal" tidak pernah sampai ke pemilik, dan hanya ada satu baris log.

## Request

Laporan hasil penyalaan bot (aktif atau gagal) harus sampai ke pemilik walaupun koneksi ke Telegram sempat terganggu sebentar. Kalau tetap tidak bisa dikirim, kegagalannya harus jelas di log. Selidiki juga keterlambatan sekitar 2 menit pada pesan pertama ke bot baru, dan catat penyebabnya.

## Done when

- [ ] Kalau pengiriman laporan penyalaan gagal karena gangguan jaringan sesaat, master mencoba lagi dan laporan tetap sampai setelah koneksi pulih. Ini dibuktikan dengan tes otomatis memakai Telegram tiruan yang gagal beberapa kali.
- [ ] Kalau setelah beberapa percobaan laporan tetap gagal, log master menyebutnya dengan jelas, tanpa mencetak token.
- [ ] Teks pesan gagal tidak lagi mengklaim "Status tercatat 'failed'" kalau pencatatan status itu sendiri gagal (catatan reviewer 4706).
- [ ] CLAUDE.md mencatat penyebab keterlambatan pesan pertama ke bot baru, atau menyatakan penyebabnya belum diketahui beserta apa yang sudah diperiksa.
- [ ] (owner) Pemilik mendaftarkan bot baru dan menerima pesan "aktif" dari master-bot.

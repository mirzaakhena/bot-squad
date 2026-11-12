---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 23:55
---

## Background

Ditemukan worker tiket 261112223101 (2026-11-12): kalau Telegram tidak terjangkau saat master-bot menyala, pustaka Telegram terus mencoba terhubung, dan selama itu master-bot tidak bereaksi pada Ctrl+C maupun SIGTERM. Hanya kill -9 yang bisa menghentikannya. Di server, master-bot jadi sulit dimatikan atau di-restart justru saat jaringan bermasalah. Kunci "master-bot sudah berjalan" (261112211002) juga tidak dilepas kalau dihentikan dengan kill -9, walaupun kunci basi seharusnya bisa diambil alih.

## How to reproduce

1. Buat Telegram tidak terjangkau (mis. jaringan diputus, atau diarahkan ke alamat yang tidak menjawab).
2. Jalankan master-bot.
3. Tekan Ctrl+C: master-bot tidak berhenti.

## Request

Master-bot selalu bisa dihentikan dengan Ctrl+C atau SIGTERM dalam waktu singkat, termasuk saat Telegram tidak terjangkau ketika master baru menyala.

## Done when

- [ ] Saat Telegram tidak terjangkau sejak master-bot menyala, Ctrl+C atau SIGTERM menghentikan master-bot paling lama 5 detik, dengan pesan yang menjelaskan bahwa Telegram belum terjangkau.
- [ ] Kunci "master-bot sudah berjalan" dilepas saat berhenti dengan cara ini.
- [ ] Token tidak muncul di keluaran mana pun.
- [ ] Dibuktikan dengan tes otomatis memakai proses master sungguhan, tanpa token asli dan tanpa menghubungi Telegram sungguhan.

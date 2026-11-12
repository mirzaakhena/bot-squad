---
type: feature
priority: low
lane: strict
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Saat ini setiap bot hanya melayani pemilik. Pemilik ingin bisa mengizinkan orang lain memakai bot tertentu saja (CLAUDE.md, bagian Pengguna). Bot berjalan dengan izin bebas, jadi siapa pun yang diizinkan bisa menyuruh bot menjalankan apa saja di server.

## Request

Pemilik bisa menambah dan mencabut akses orang lain ke satu bot tertentu dari master-bot, tanpa memberi mereka akses ke master-bot atau bot lain.

## Done when

- [ ] /allow <nama> <user_id> membuat orang itu bisa mengobrol dengan bot itu saja; bot lain dan master-bot tetap menolaknya.
- [ ] /revoke <nama> <user_id> mencabut akses itu, dan pesan orang itu setelahnya diabaikan.
- [ ] Pemilik tidak bisa mencabut aksesnya sendiri dari bot.
- [ ] Ada cara melihat siapa saja yang punya akses ke sebuah bot.
- [ ] Balasan /allow mengingatkan bahwa orang itu bisa menjalankan perintah apa pun di server lewat bot.
- [ ] Dibuktikan dengan tes otomatis.

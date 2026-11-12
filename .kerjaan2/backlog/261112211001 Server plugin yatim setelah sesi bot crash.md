---
type: bug
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 21:10
---

## Background

Setiap bot adalah sesi Claude Code yang menjalankan server plugin bot-squad sebagai proses anak. Spike dua bot membuktikan bahwa kalau proses Claude sebuah bot mati mendadak (crash atau `kill -9`), server plugin-nya tidak ikut keluar. Server itu berhenti polling dan menghapus file pid-nya, tetapi prosesnya tetap hidup tanpa induk dan terus memakan CPU sekitar 99%. Karena file pid sudah hilang, master maupun skrip start tidak bisa menemukannya. Mematikan sesi secara normal (menutup sesi tmux) tidak menimbulkan masalah ini.

Teramati di macOS dengan Claude Code 2.1.322 dan bun 1.3.11. Detail dan cara membersihkannya secara manual ada di CLAUDE.md.

## How to reproduce

1. Nyalakan satu bot uji dengan skrip start.
2. Matikan paksa proses Claude bot itu (`kill -9`).
3. Lihat daftar proses: server plugin bot itu masih hidup tanpa induk dan memakan CPU sekitar 99%, padahal file pid-nya sudah tidak ada.

## Request

Sesi bot yang crash tidak boleh meninggalkan server plugin yang terus hidup dan memakan CPU. Cari penyebab server plugin tidak keluar dan perbaiki kalau bisa. Kalau tidak bisa, menyalakan bot yang sama berikutnya harus menemukan dan mematikan server sisa milik bot itu, dan hanya milik bot itu.

## Done when

- [ ] Setelah proses Claude sebuah bot dimatikan paksa, dalam waktu singkat tidak ada server plugin bot itu yang tersisa. Kalau tidak bisa, server sisanya dibersihkan otomatis saat bot itu dinyalakan lagi.
- [ ] Server plugin milik bot lain dan plugin lain di mesin (misalnya WhatsApp) tidak pernah ikut dimatikan.
- [ ] Penyebab server tidak keluar dicatat di CLAUDE.md, termasuk apakah ini bug di plugin atau di bun.
- [ ] Logika mengenali server sisa milik bot tertentu dibuktikan dengan tes otomatis.
- [ ] Mematikan sesi secara normal tetap bersih seperti sebelumnya.

## Out of scope

- Menghidupkan ulang bot secara otomatis setelah crash.

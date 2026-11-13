---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112225307, 261112225306, 261112225308]
touches: []
created: 2026-11-13 19:44
---

## Background

Pada 2026-11-13, kumpulan tes proyek beberapa kali gagal lalu lulus saat diulang, tanpa perubahan kode:

- Saat tiket 261112225307 pertama kali akan digabung ke main, tes gagal (exit 1) dengan isi yang sama persis dengan yang kemudian lulus. Penyebabnya tidak terlihat karena keluaran tes tidak tersimpan.
- Worker 261112225306 melihat kegagalan acak di tes hapus bot (balasan kosong dari Telegram tiruan, dugaan koneksi yang dipakai ulang) dan di tes menu dan tes jalankan master-bot.
- Worker 261112225308 melihat tes menu master-bot gagal sekali dengan "500 pada all_group_chats", padahal perubahannya hanya di CLAUDE.md.

Tes yang tidak stabil memperlambat penggabungan dan bisa menyembunyikan bug sungguhan.

## How to reproduce

1. Jalankan seluruh tes proyek beberapa kali berturut-turut, terutama saat ada tes lain yang berjalan bersamaan.
2. Sesekali satu tes gagal (paling sering tes menu master-bot), lalu lulus pada percobaan berikutnya.

## Request

Seluruh tes proyek memberi hasil yang sama setiap kali dijalankan pada kode yang sama.

## Done when

- [ ] Penyebab setiap kegagalan acak yang bisa direproduksi ditemukan dan dicatat di tiket.
- [ ] Seluruh tes proyek lulus berturut-turut berkali-kali (jumlahnya disebut di tiket), juga saat dua kumpulan tes berjalan bersamaan dari dua salinan repo.
- [ ] Perbaikannya tidak melemahkan apa yang diuji: tidak ada tes yang dihapus, dilewati, atau batas waktunya dilonggarkan tanpa alasan tercatat.
- [ ] Kalau ada penyebab yang tidak bisa direproduksi, langkah untuk menangkapnya lain kali tercatat di CLAUDE.md.

## Out of scope

- Mengubah perilaku master-bot atau plugin, kecuali bug sungguhan yang ditemukan lewat tes ini (dicatat terpisah).

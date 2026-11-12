---
type: bug
priority: medium
lane: strict
labels: []
blocked_by: []
related: []
touches: [master/src/main.ts, master/src/config.ts, master/test/run.test.ts, CLAUDE.md]
created: 2026-11-12 21:10
---

## Background

master-bot dijalankan dengan satu token. Telegram hanya mengizinkan satu penerima pesan per token. Saat review terbukti bahwa kalau master-bot dijalankan untuk kedua kalinya, Telegram menolak instance yang lama, bukan yang baru. Akibatnya master-bot yang sedang berjalan berhenti dengan pesan "sudah berjalan di tempat lain", sementara instance baru diam-diam mengambil alih. Pesan itu menyesatkan, dan pemilik bisa kehilangan master-bot yang selama ini berjalan tanpa sadar.

## Request

Menjalankan master-bot kedua kalinya di mesin yang sama harus langsung ditolak oleh instance yang baru, sementara yang lama tetap berjalan. Kalau Telegram tetap melaporkan bentrok, misalnya karena master-bot dijalankan di mesin lain, pesannya harus menjelaskan apa yang sebenarnya terjadi.

## Done when

- [ ] Menjalankan master-bot kedua dengan folder data yang sama (kunci BOT_SQUAD_HOME/master/master.pid, dibuat atomik dan berisi pid) langsung berhenti dengan pesan jelas di terminal bahwa master-bot sudah berjalan, kode keluar 1, tanpa memanggil API Telegram apa pun dan tanpa pesan ke pemilik. Instance pertama tetap berjalan.
- [ ] Kunci dianggap basi kalau pid di dalamnya sudah mati atau prosesnya bukan master/src/main.ts. Kunci dihapus saat master berhenti normal.
- [ ] Kalau master-bot sebelumnya mati mendadak, master-bot bisa dijalankan lagi tanpa langkah manual.
- [ ] Pesan untuk bentrok dari Telegram menjelaskan bahwa proses ini digantikan oleh master-bot lain, bukan sekadar "sudah berjalan di tempat lain".
- [ ] Token tidak pernah muncul di pesan mana pun.
- [ ] Perilaku di atas dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Cakupan kunci 'mesin yang sama'. Pilihan: (a) satu kunci per folder data (BOT_SQUAD_HOME/master/master.pid); (b) satu kunci per token/ID master-bot di folder global mesin. Rekomendasi (a): registry dan bot ada di folder data, sederhana, dan tes bisa memakai folder sementara. Dua folder data berbeda dengan token sama tetap berujung 409, yang pesannya dijelaskan (Done when 3).
  → (a) per folder data (BOT_SQUAD_HOME/master/master.pid). (owner, 2026-11-12)
- Q2 [answered] Cara menilai kunci basi setelah master mati mendadak. Rekomendasi: kunci dibuat atomik (seperti kunci install plugin), berisi pid; kunci dianggap basi kalau pid itu sudah mati ATAU proses dengan pid itu bukan master-bot (perintahnya tidak menjalankan master/src/main.ts), untuk menghindari pid yang dipakai ulang OS. Kunci dihapus saat master berhenti normal. Setuju?
  → Setuju. (owner, 2026-11-12)
- Q3 [answered] Saat instance kedua ditolak, apakah pemilik juga diberi tahu lewat Telegram? Rekomendasi: tidak; cukup pesan di terminal dan kode keluar 1, dan instance kedua tidak memanggil API Telegram sama sekali (tidak ada getMe, setMyCommands, atau getUpdates), supaya instance pertama tidak terganggu.
  → Setuju. (owner, 2026-11-12)

## Assumptions
- A1 [unseen] Kunci diambil sebelum panggilan Telegram apa pun, setelah konfigurasi terbaca
  Why: Done when: instance pertama tetap berjalan; getUpdates dari instance kedua akan mengusir yang pertama
  If wrong: -
- A2 [unseen] Bukti otomatis memakai dua proses main.ts sungguhan dengan fake-telegram dan BOT_SQUAD_HOME sementara (seperti run.test.ts); kunci basi disimulasikan dengan file berisi pid yang sudah mati
  Why: Pola tes yang ada di master/test/run.test.ts; agen tidak boleh mematikan proses di luar buatannya
  If wrong: -

## Decisions
- Lane strict: kunci instance tunggal panel kontrol; kunci yang salah bisa mengunci pemilik di luar atau menghilangkan master-bot diam-diam
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue

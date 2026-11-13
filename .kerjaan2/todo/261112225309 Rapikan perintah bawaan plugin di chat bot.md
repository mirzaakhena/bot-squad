---
type: task
priority: low
lane: light
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, plugin/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Di chat sebuah bot, perintah /start, /help, dan /status dijawab langsung oleh plugin dengan teks soal pairing ("DM me anything — you'll get a 6-char code"). Bot-squad tidak memakai pairing (akses diatur lewat allowlist), jadi teks itu menyesatkan.

## Request

Jawaban bot atas /start, /help, dan /status sesuai cara kerja bot-squad, tanpa instruksi pairing.

## Done when

- [ ] /start dan /help di chat bot menjelaskan bahwa pesan diteruskan ke sesi Claude bot itu, tanpa instruksi pairing.
- [ ] /status di chat bot memberi tahu pengirim bahwa ia diizinkan (dengan ID/username-nya), tanpa menawarkan kode pairing.
- [ ] /start, /help, dan /status hanya dibalas untuk pengirim di allowFrom di chat pribadi, apa pun dmPolicy-nya (sama seperti /context); orang lain, termasuk saat dmPolicy 'pairing', tidak mendapat balasan apa pun.
- [ ] (owner) Pemilik mengirim /start ke bot uji dan melihat teks yang baru.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Siapa yang dibalas /start, /help, /status? (a) Hanya pengirim di allowFrom, di chat pribadi, apa pun dmPolicy-nya, sama seperti /context (contextAllowed). Akibatnya /status hanya pernah dijawab ke orang yang diizinkan, berisi 'kamu diizinkan memakai bot ini' plus ID/username-nya; orang lain tidak dapat balasan apa pun. (b) Tetap seperti sekarang (dmCommandGate): kalau dmPolicy 'pairing', siapa saja dibalas, dan /status orang tak diizinkan menjawab 'tidak diizinkan, minta pemilik lewat /allow'. Rekomendasi (a): cocok dengan butir 'orang yang tidak diizinkan tetap tidak mendapat balasan apa pun', tidak membocorkan keberadaan bot, dan bot-squad selalu menulis dmPolicy allowlist.
  → Hanya yang diizinkan (Recommended) — hanya pengirim di allowFrom, chat pribadi, apa pun dmPolicy, sama seperti /context; orang lain tidak dibalas. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Teks baru /start, /help, /status dan deskripsi menu (setMyCommands all_private_chats) ditulis dalam Bahasa Indonesia, menyebut /context, tanpa kata pairing atau kode; skill /bot-squad:access dan alur pairing pesan biasa tidak diubah
  Why: Pemilik berkomunikasi dalam Bahasa Indonesia dan tambahan plugin sebelumnya (/context) sudah berbahasa Indonesia; tiket hanya meminta jawaban perintah
  If wrong: Ganti string di plugin/server.ts
- A2 [unseen] Ada tes otomatis server plugin sungguhan (pola plugin/test/context-command.test.ts, Telegram tiruan lewat BOT_SQUAD_TELEGRAM_API_ROOT) untuk teks baru dan untuk pengirim tak diizinkan yang tidak dibalas; semua uji mengikuti aturan uji di bawah
  Why: Konvensi proyek: setiap perubahan perilaku punya tes, tanpa token asli
  If wrong: Hapus berkas tes
- A3 [unseen] Aturan uji wajib: jangan membaca/menulis ~/.bot-squad; uji dengan HOME/BOT_SQUAD_HOME sementara berisi SALINAN tanpa symlink (cek find -type l); server tmux terpisah lewat TMUX_TMPDIR/-S (socket boleh di /tmp/k2-261112225309-*, hapus sesudahnya); master-bot, uji-03, uji-01 di server tmux default tidak disentuh; tanpa token asli; berkas sementara di scratchpad subfolder 261112225309, bukan di repo; kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar
  Why: Aturan pemilik; .env master asli pernah terpotong lewat symlink
  If wrong: -

## Decisions
- Lane light: hanya teks balasan dan deskripsi menu plugin, mudah dibatalkan; gerbang balasan diselaraskan dengan contextAllowed yang sudah ada
- Tidak solo, tidak menunggu: hanya plugin/server.ts dan tesnya; boleh berjalan berdampingan dengan 261112225308 (yang hanya CLAUDE.md)

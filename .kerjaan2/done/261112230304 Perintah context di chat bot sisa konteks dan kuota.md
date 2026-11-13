---
type: feature
priority: high
lane: standard
labels: []
blocked_by: []
related: [261112225308]
touches: [plugin/server.ts, plugin/statusline.ts, plugin/test, master/src/launch.ts, master/test/launch.test.ts, CLAUDE.md]
created: 2026-11-12 23:03
---

## Background

Pemilik ingin tahu sisa konteks sesi bot dan sisa kuota akun Claude (dipakai bersama semua bot). Di mirza-bots, /context dijawab dari data statusline Claude Code yang ditangkap ke berkas, tanpa mengirim apa pun ke Claude. Di bot-squad, pengaturan tiap bot ditentukan sendiri saat start, jadi statusline bisa dipasang tanpa menggusur milik siapa pun. Data statusline juga memuat batas kuota 5 jam dan 7 hari, sehingga riset 261112225308 kemungkinan besar terjawab di sini.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Pemilik bisa mengetik /context di chat bot dan langsung mendapat sisa konteks sesi itu serta sisa kuota akun, tanpa memakai giliran Claude.

Ikuti persis /context di mirza-bots (keputusan pemilik): format balasan dari /Users/mirza/Workspace/mirza-bots/cc-plugin/src/engine/context/render.ts (renderContext, boleh disalin dengan catatan asal), cara tangkap dan pagar statusline dari README.md mirza-bots bagian "/context dan pagar statusline" serta kode bridge/chain di cc-plugin/src/engine/context/. Data hanya dari status.json bot itu sendiri.

## Done when

- [x] /context di chat bot membalas dengan isi dan format renderContext mirza-bots, dari status.json bot itu sendiri: bagian Context (bar titik, persen, token), Rate Limit 5h dan 7d (persen dan "reset <durasi>", bagian dihilangkan kalau tidak ada data, bukan 0%), metadata yang barisnya dilewati kalau tanpa data, dan "Last update: HH:MM WIB (Xm ago)"; label berbahasa Inggris; tanpa mengirim apa pun ke sesi Claude.
- [x] Kalau data belum tersedia (sesi baru) atau status.json tidak terbaca, balasannya menjelaskan itu, bukan angka kosong atau salah.
- [x] Pengirim yang tidak ada di allowFrom tidak mendapat balasan apa pun atas /context, dibuktikan tes.
- [x] Statusline bot menangkap payload lalu meneruskan payload yang sama ke statusline pendahulu (lapisan project/local workspace bot, lalu user ~/.claude/settings.json) dan mencetak keluarannya; gagal menangkap tidak mematikan baris status; kalau pendahulu tidak bisa dipastikan, tidak ada rantai yang merusak dipasang dan /context melapor apa adanya.
- [x] Statusline milik pemilik di luar bot-squad tidak berubah: tidak ada berkas pengaturan Claude yang ditulis.
- [x] Dibuktikan dengan tes otomatis.
- [x] (owner) Pemilik mengirim /context ke bot uji dan angkanya masuk akal.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Siapa yang boleh memakai /context? Opsi: (A) hanya pengirim yang ada di allowFrom bot itu, di chat pribadi; selain itu tidak dibalas sama sekali, sama seperti pesan biasa; (B) siapa pun yang lolos gerbang perintah plugin sekarang (dmCommandGate, yang meloloskan non-allowlist kalau dmPolicy 'pairing'). Rekomendasi: A, karena angka kuota adalah informasi akun pemilik dan bot-squad tidak memakai pairing. Kalau A, saya tambahkan baris Done when: 'Pengirim yang tidak ada di allowFrom tidak mendapat balasan apa pun atas /context, dibuktikan tes.'
  → Hanya yang diizinkan. Hanya pengirim di allowFrom bot itu, di chat pribadi; yang lain tidak dibalas sama sekali. Tambahkan baris Done when yang kamu usulkan. (owner, 2026-11-13)
- Q2 [answered] Bentuk waktu pulih kuota. Opsi: (A) sisa durasi saja, mis. 'pulih 2j 15m lagi'; (B) sisa durasi plus jam dalam WIB (Asia/Jakarta, tetap UTC+7, seperti mirza-bots), mis. 'pulih 2j 15m lagi (14:30 WIB)'; (C) sisa durasi plus jam menurut zona waktu server. Rekomendasi: B, karena server nanti kemungkinan Linux ber-UTC sehingga C bisa menampilkan jam yang membingungkan, dan WIB adalah zona pemilik.
  → Untuk /context ikuti persis yang ada di mirza-bots: waktu pulih kuota hanya berupa durasi ("reset 2h 15m"). Jam WIB hanya untuk "Last update: HH:MM WIB (Xm ago)". (owner, 2026-11-13)
- Q3 [answered] Statusline yang dipasang bot-squad juga tampil di layar tmux bot (dan nanti di /logs). Apa yang dicetaknya? Opsi: (A) tidak mencetak apa pun, hanya menangkap data (baris status kosong); (B) satu baris ringkas, mis. 'ctx 34% · 5j 12% · 7h 40%'. Rekomendasi: B, karena murah dan membantu saat melihat layar sesi; kegagalan menangkap tetap tidak boleh mematikan baris ini.
  → Untuk /context ikuti persis yang ada di mirza-bots: bridge yang menangkap payload lalu meneruskan ke statusline pendahulu milik pemilik, sehingga statusline pemilik tidak tergusur. Tentukan cara setara yang aman, dengan pagar dari README mirza-bots: kalau tidak bisa dipastikan, jangan memasang apa pun yang merusak, dan /context melapor apa adanya. (owner, 2026-11-13)
- Q4 [answered] Bahasa dan isi balasan /context. Opsi: (A) Bahasa Indonesia, hanya yang diminta: konteks terpakai (persen, plus token terpakai/ukuran jendela bila ada), kuota 5 jam dan 7 hari (persen terpakai dan waktu pulih), dan umur data; (B) seperti A ditambah metadata seperti mirza-bots (model, id sesi, biaya sesi); (C) Bahasa Inggris seperti teks bawaan plugin. Rekomendasi: A, sesuai permintaan dan konvensi bahasa proyek; metadata bisa ditambah belakangan. Bagian kuota yang datanya tidak ada (mis. akun tanpa rate_limits) ditulis 'kuota belum tersedia', bukan 0%.
  → Untuk /context ikuti persis yang ada di mirza-bots: isi dan format sama dengan renderContext (Context, Rate Limit 5h dan 7d yang dihilangkan kalau tidak ada data, metadata yang barisnya dilewati kalau tanpa data, Last update). Label berbahasa Inggris seperti aslinya. Kode render boleh disalin dari mirza-bots dengan catatan asal. (owner, 2026-11-13)
- Q5 [answered] Data statusline hanya diperbarui saat Claude Code menggambar ulang baris status, jadi bot yang menganggur lama menyimpan angka kuota lama, padahal kuota milik akun. Opsi: (A) data bot ini saja, dengan umur data, mis. 'data 2 jam lalu'; (B) konteks dari bot ini, kuota dari tangkapan TERBARU di antara semua bot (BOT_SQUAD_HOME/bots/*/state), dengan umur data; (C) data bot ini tanpa umur. Rekomendasi: B, karena tangkapan bot mana pun yang paling baru paling mendekati kenyataan dan biayanya kecil. A kalau plugin tidak boleh membaca folder bot lain.
  → Untuk /context ikuti persis yang ada di mirza-bots: data hanya dari bot ini sendiri (status.json bot itu), dengan Last update sebagai umur data. Plugin tidak membaca folder bot lain. (owner, 2026-11-13)

## Assumptions
- A1 [confirmed] Statusline dipasang hanya lewat --settings di claudeArgv (master/src/launch.ts), berupa perintah bun ke skrip di plugin/ yang menulis tangkapan ke <state>/status.json (0600, tulis atomik). Tidak ada berkas di ~/.claude yang ditulis.
  Why: Done when 3 dan konvensi proyek: pengaturan tiap bot ditentukan saat start; --setting-sources project,local sudah mencegah statusline user termuat.
  If wrong: Hapus statusLine dari claudeArgv dan skrip tangkapnya.
  Confirmed by owner, 2026-11-13
- A2 [confirmed] Gagal menangkap (JSON rusak, tulis gagal) tidak pernah membuat statusline error; status.json yang rusak atau tak terbaca dibalas /context sebagai 'data belum tersedia/tidak terbaca', bukan angka.
  Why: Done when 2: tidak boleh ada angka kosong atau salah; pola pagar mirza-bots.
  If wrong: Ubah teks balasan saja.
  Confirmed by owner, 2026-11-13
- A3 [confirmed] /context ditambahkan ke menu perintah plugin (setMyCommands all_private_chats) dan dicatat di plugin.log sebagai hasil=tidak-diteruskan seperti /start, /help, /status.
  Why: Konvensi yang ada di plugin/server.ts dan CLAUDE.md bagian Log tiap bot.
  If wrong: Hapus entri menu.
  Confirmed by owner, 2026-11-13
- A4 [confirmed] Nama field payload (context_window.used_percentage, rate_limits.five_hour/seven_day.used_percentage dan resets_at dalam detik epoch) diverifikasi terhadap payload nyata Claude Code terpasang, ditangkap dari sesi claude di tmux uji tanpa plugin dan tanpa token, di scratchpad subfolder 261112230304; hasilnya dicatat di CLAUDE.md.
  Why: Lesson proyek: jangan pakai token atau data asli ~/.bot-squad; field diambil dari render.ts mirza-bots.
  If wrong: Tidak ada yang perlu dibatalkan.
  Confirmed by owner, 2026-11-13
- A5 [confirmed] Bot yang sudah hidup baru mendapat /context setelah dinyalakan ulang (start-bot.sh atau /register ulang); belum ada /restart. Dicatat di CLAUDE.md.
  Why: --settings hanya dibaca saat claude start.
  If wrong: Tidak ada.
  Confirmed by owner, 2026-11-13
- A6 [confirmed] status.json sesi sebelumnya dihapus saat bot dinyalakan, supaya /context sesi baru tidak menampilkan angka sesi lama.
  Why: Done when 2: sesi baru harus dijelaskan belum ada data, bukan angka lama.
  If wrong: Hapus rmSync status.json di prepareStatusline (master/src/statusline.ts).
  Confirmed by owner, 2026-11-13
- A7 [confirmed] Penantian data /context berjalan tanpa await di handler grammY, supaya tunggu sampai 18 detik tidak menahan pesan lain.
  Why: grammY memproses update berurutan.
  If wrong: Kembalikan ke await di bot.command('context').
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: fitur baca-saja baru di plugin plus satu pengaturan --settings saat start; tidak menyentuh login, uang, atau data yang tak bisa dipulihkan, dan mudah dibatalkan.
- Tidak solo dan tidak menunggu tiket lain: papan kosong, dan /context dijawab plugin langsung sehingga tidak butuh mekanisme 261112230302. 261112225308 (riset kuota) hanya related, tetap di backlog.
- Rantai statusline: master menentukan pendahulu saat start (workspace .claude/settings.local.json, .claude/settings.json, lalu ~/.claude/settings.json, seperti resolveChain mirza-bots) dan menyematkannya ke perintah bridge di --settings. Berkas tak terbaca atau JSON rusak berarti tidak pasti: bridge dipasang tanpa rantai (hanya menangkap), dicatat di log; start bot tidak gagal.
- Q3 tidak perlu ditanyakan lagi: pemilik meminta ikut mirza-bots. Akibatnya statusline user (rekam-statusline.sh) ikut dijalankan di sesi bot, sama seperti di mirza-bots. Bridge mengenali dirinya sendiri (isOurBridge) supaya tidak merantai ke dirinya.
- Pagar 3 mengikuti mirza-bots, bukan keputusan awal 'bridge tanpa rantai': kalau berkas settings ada tetapi tak terbaca, bridge tidak dipasang sama sekali dan /context melaporkan alasannya. Pemilik meminta pagar README mirza-bots (Q3).
- Rantai disimpan di <state>/chained-statusline yang ditulis master saat start (seperti mirza-bots), bukan disematkan ke perintah --settings, supaya tidak ada kutip shell bertingkat. Perintah bridge hanya membawa path state.

## Manual checks
- M1 [ok] (item 7) 1. Gabungkan tiket ini, lalu nyalakan ulang bot uji (scripts/start-bot.sh <nama> setelah sesi lamanya dimatikan, atau /register bot baru).
  2. Di chat pribadi bot itu kirim satu pesan biasa dan tunggu jawabannya.
  3. Kirim /context.
  4. Harus muncul bagian Context dengan bar titik, persen dan token, Rate Limit 7d (dan 5h kalau akun memilikinya) dengan 'reset <durasi>', baris model/Session/CWD/Cost, dan 'Last update: HH:MM WIB' dengan umur beberapa detik; angkanya cocok dengan baris status di tmux attach -t <nama>.
  Checked by owner, 2026-11-13

## Handoff
/context dijawab plugin dari <state>/status.json bot itu sendiri, tanpa ke Claude; hanya pengirim allowFrom di DM (contextAllowed). Render adalah salinan renderContext mirza-bots (plugin/context-render.ts), jangan diubah. Master (master/src/statusline.ts, dipanggil launch.ts sebelum tmux) mencari statusline pendahulu local>project>user, menulis chained-statusline dan statusline.json di state, lalu memasang plugin/bot-squad-statusline.ts lewat --settings di claudeArgv; kalau tak pasti, tidak dipasang. Yang tidak boleh rusak: tidak ada berkas pengaturan Claude yang ditulis; bridge selalu meneruskan ke pendahulu walau tangkap gagal; bridge dan context.ts hanya mengimpor node:. claudeArgv kini menerima argumen statusLine.

## Review
- 2026-11-13 standard, round 1, at 755007b: passed.
  1: context-render.ts identik byte dengan render.ts mirza-bots selain komentar. Uji mandiri (HOME sementara): bridge via sh -c dari --settings lalu answerContext, hasilnya === renderContext mirza-bots asli. context-command.test (server nyata) lulus, stdout tanpa notifikasi ke Claude.
  2: context.test 'setiap jalan keluar' lulus (sesi baru, tunggu, tak muncul, JSON rusak, EACCES, tanpa bridge); uji mandiri: settings user chmod 000 -> refused, /context membalas alasannya tanpa angka.
  3: context-command.test lulus: orang asing DM (pairing), pemilik di supergroup, orang asing di grup tidak dikirimi apa pun; pemilik DM dibalas sekali.
  4: uji mandiri: pendahulu .sh di path berspasi menerima payload sama persis, keluarannya tampil utuh; refused untuk berkas tak terbaca dan bridge sendiri, argv tanpa statusLine. statusline-bridge, statusline, launch test lulus.
  5: statusline.ts hanya membaca settings; uji mandiri: isi dan mtime settings user tetap, workspace/.claude kosong; yang ditulis hanya berkas di state. Statusline pemilik dirantai, tidak digusur.
  6: k2 test pada 5 berkas tes terkait: 110 pass 0 fail.
  7: (owner) M1 bisa diikuti dari awal dan berakhir pada yang harus terlihat.
  note: sesi claude nyata di tmux (statusLine dari --settings dipakai walau --setting-sources project,local) dinilai dari klaim dan CLAUDE.md saja; butuh login akun.
  note: di statusline.test, cek claudeArgv('/p', null) tanpa statusLine tak mungkin gagal (literal null); kriteria terbukti lewat launch.test dan uji mandiri.
  note: rantai ditetapkan saat start (mirza-bots memeriksa ulang tiap /context); ganti statusline user baru berlaku setelah bot dinyalakan ulang.

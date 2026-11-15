# bot-squad

Sistem untuk menjalankan **banyak bot Telegram berbasis Claude Code** di satu server, yang dikelola lewat satu control panel Telegram bernama **master-bot**.

## Terminologi (wajib konsisten)

- **bot**: satu sesi Claude Code yang berjalan di tmux dan dipasangi plugin channel Telegram custom milik proyek ini (`plugin/`). Tiap bot punya token BotFather sendiri.
- **master-bot**: **BUKAN bot**. Ini aplikasi biasa (tidak berjalan di dalam Claude Code) yang menjadi alat interaksi dan control panel pemilik lewat slash command Telegram. Jangan pernah menyebut master-bot sebagai "bot".
- **pemilik**: satu-satunya user Telegram yang boleh memakai master-bot. Telegram user ID-nya dikonfigurasi manual.

## Cara kerja yang direncanakan

1. Pemilik membuat master-bot lewat @BotFather sehingga mendapat token master-bot.
2. Aplikasi `master/` dijalankan di server dengan token master-bot dan telegram user ID pemilik. Langkah ini manual.
3. Pemilik membuat bot baru lewat @BotFather, misalnya `bot-01`, sehingga mendapat tokennya.
4. Pemilik mendaftarkan bot itu lewat slash command di master-bot dengan memberi nama bot dan token. Bentuk perintahnya masih rancangan, misalnya `/register <nama> <token>`.
5. Master membuat state dir dan working directory untuk bot tersebut, lalu membuka sesi tmux berisi `claude` dengan plugin bot-squad. Bot langsung bisa dipakai.

```
Pemilik (Telegram)
   ├── master-bot ──► master/ (Bun app): registrasi & kontrol semua bot
   ├── bot-01 ──► tmux "bot-01" ──► claude + plugin bot-squad (token bot-01)
   └── bot-02 ──► tmux "bot-02" ──► claude + plugin bot-squad (token bot-02)
```

## Keputusan yang sudah disepakati

- **Fitur master-bot** berupa banyak slash command untuk mengonfigurasi semua bot. Yang pertama adalah registrasi bot. Fitur lain seperti list, stop, restart, logs (isi layar tmux), delete, dan status kuota dikembangkan bertahap.
- **Working directory** dibuat berdasarkan nama bot.
- **Nama bot** hanya boleh berisi huruf kecil, angka, dan `-`, karena dipakai sebagai nama folder dan nama sesi tmux. Nama ini tidak harus sama dengan username Telegram bot-nya.
- **Pengguna**: saat ini hanya pemilik. Ke depan, pemilik ingin bisa mendaftarkan orang lain yang dikunci ke bot tertentu saja (lewat allowlist `access.json` per bot).
- **Mode izin**: bot berjalan bebas dengan `--dangerously-skip-permissions`.
- **Lingkungan**: development di MacBook (darwin), nanti dipindah ke server (kemungkinan Linux). Jangan hardcode hal yang khusus macOS.
- **Stack**: Bun + TypeScript + grammY, sama dengan plugin aslinya.

## Struktur repo

```
bot-squad/            # root project & root git
├── CLAUDE.md
├── package.json      # workspace Bun: hanya ["master"]; dependency plugin/ dipasang terpisah oleh scripts/start-bot.sh
├── master/           # aplikasi master-bot (Bun + grammY), tes di master/test/
├── docs/             # rincian per topik, dibaca saat perlu (daftar isi di bawah)
├── scripts/          # start-bot.sh: hasil spike menyalakan bot (satu atau beberapa sekaligus)
└── plugin/           # fork plugin Telegram resmi, sudah diganti nama jadi "bot-squad"
```

- `plugin/` disalin dari `anthropics/claude-plugins-official` → `external_plugins/telegram` (versi 0.0.7, commit upstream `e0ab6e5`). Sengaja disalin apa adanya supaya perubahan fork bisa dilihat lewat `git diff`.
- `../mirbot/claude-official-telegram-channel/` (path absolut `/Users/mirza/Workspace/mirbot/claude-official-telegram-channel/`, di luar repo) adalah salinan upstream untuk referensi. Folder ini **tidak ikut git** dan jangan diubah.
- Lokasi repo: `~/Workspace/bot-squad`, remote `origin` adalah `https://github.com/mirzaakhena/bot-squad` (branch `main`). Salinan lama di `~/Workspace/mirbot/bot-squad` tidak dipakai lagi.

## Data runtime (di luar repo)

Token dan state **tidak boleh** masuk repo.

```
~/.bot-squad/
├── master/.env              # token master-bot + telegram user ID pemilik
├── registry.json            # daftar bot terdaftar (sumber kebenaran untuk master)
└── bots/<nama-bot>/
    ├── state/               # TELEGRAM_STATE_DIR: .env (token), access.json, inbox/, bot.pid, plugin.log,
    │                        #   status.json, chained-statusline, statusline.json (untuk /context)
    └── workspace/           # working directory Claude Code untuk bot ini
```

## Menjalankan master-bot dan tes

Sekali di root repo: `bun install`. Lalu jalankan dari root repo:

```bash
bun run --cwd master start
```

- Konfigurasi hanya dibaca dari `$BOT_SQUAD_HOME/master/.env` (default `~/.bot-squad/master/.env`): `MASTER_BOT_TOKEN` dan `OWNER_TELEGRAM_ID`. Hanya pemilik di chat pribadinya yang dilayani.
- Perintah saat ini: `/start`, `/help`, `/register <nama> <token>`, `/list`, `/stop <nama>`, `/restart <nama>`, `/logs <nama> [n]`, `/quota`, `/allow <nama> <user_id>`, `/revoke <nama> <user_id>`, `/access <nama>`, dan `/delete <nama>`. Perilaku rincinya di `docs/master-bot.md`.
- Menyalakan satu bot tanpa master-bot: `scripts/start-bot.sh <nama-bot>` (kode yang sama, `master/src/launch.ts`; rincian di `docs/menyalakan-bot.md`).
- Tes: `bun test` dari root repo. Tes memakai server Telegram tiruan (`master/test/fake-telegram.ts`), jadi tidak butuh token asli. Tes plugin dilewati kalau `plugin/node_modules` belum dipasang (`bun install --cwd plugin`). Rincian di `docs/tes.md`.
- Folder `master/test/` dan `plugin/test/` dikecualikan dari secret scanning GitHub (`.github/secret_scanning.yml`): hanya boleh berisi token tiruan, token asli tidak akan terdeteksi. Lihat `docs/tes.md`.

## Jebakan yang berlaku lintas pekerjaan

- **Data asli pemilik tidak boleh disentuh saat uji.** `~/.bot-squad` berisi token dan registry asli, dan bot pemilik berjalan di server tmux default. Uji memakai `HOME`, `BOT_SQUAD_HOME`, dan `TMUX_TMPDIR` sementara (salinan, bukan symlink; token palsu), dan perintah tmux uji hanya ke soket server uji itu.
- **Satu poller `getUpdates` per token.** Poller kedua mendapat 409. Master tidak boleh polling dengan token bot (validasi cukup `getMe`) dan harus mencegah satu bot dijalankan dua kali.
- **Plugin lokal tidak bisa lewat `--channels`** (hanya allowlist Anthropic). Plugin dimuat dengan `--plugin-dir <repo>/plugin --dangerously-load-development-channels plugin:bot-squad@inline`; dialog konfirmasinya muncul setiap start dan dijawab otomatis dengan `Enter`. Dialog lain default-nya "No, exit": jangan kirim `Enter` buta. Peringatan `plugin:bot-squad@inline · plugin not installed` di layar awal itu palsu.
- **State per bot** lewat `TELEGRAM_STATE_DIR` (diwariskan dari `tmux new-session -e` sampai ke server plugin); token dari `TELEGRAM_BOT_TOKEN` di environment atau `<STATE_DIR>/.env`.
- **Hilangnya `bot.pid` bukan bukti server plugin mati.** `shutdown()` menghapusnya sebelum proses keluar. Cek dengan `ps -o pid,ppid,stat,%cpu,etime -p <pid>`.
- **Server plugin dikenali lewat environment, bukan baris perintah.** Plugin lain (misalnya WhatsApp) juga `bun server.ts`; bedakan lewat `CLAUDE_PLUGIN_ROOT` dan `TELEGRAM_STATE_DIR` (`master/src/strays.ts`).
- **`bun install` bersamaan di `plugin/` saling bertabrakan.** Plugin tidak memasang paket sendiri; `launch.ts` memasangnya dengan kunci sebelum tmux dibuka.
- **Server tiruan di tes wajib `hostname: "127.0.0.1"`** (tiket 261113194401); tanpa itu macOS bisa memberi port yang sudah didengar proses lain dan tes gagal acak.
- **Token tidak pernah dicetak**: log dan balasan disensor; error jaringan grammY membawa URL berisi token.
- **Kunci per bot `BotLocks`**: pekerjaan apa pun yang menyalakan atau menghentikan bot memakai objek `BotLocks` yang sama dari `main.ts`.
- **Bot yang sudah berjalan** baru mendapat perubahan plugin atau `--settings` setelah dinyalakan ulang (`/restart`).

## Prinsip: perintah terpilih, bukan semua slash Claude Code

bot-squad hanya mendukung beberapa perintah chat bot yang dipilih pemilik karena penting dan sering dipakai (saat ini `/start`, `/help`, `/status`, `/context`). Slash command Claude Code lain (misalnya `/compact`, `/model`) **tidak** diteruskan ke sesi bot, juga tidak dengan tombol konfirmasi (tiket 261112230305 dibatalkan oleh pemilik, 2026-11-13). Perintah baru yang mengetik ke sesi Claude (interrupt, new, rename, branch/switch) ditambahkan satu per satu sebagai perintah khusus, menunggu rancangan mekanismenya (tiket 261112230302).

## Bot berkirim pesan ke bot lain: dibatalkan

Dibatalkan pemilik (2026-11-15): tidak ada fitur bot-squad untuk ini. Tidak diperlukan: bot sudah bisa saling berkirim pesan dengan fitur bawaan Claude Code, cukup pemilik menyebut nama bot tujuan (terbukti dipakai pemilik, 2026-11-15). Bot pengirim menjalankan `ListAgents`, mencari baris yang kolom tmux-nya nama bot tujuan (nama sesi tmux selalu sama dengan nama bot), lalu mengirim ke nama sesi di baris itu. Session-id bukan alamat dan `status.json` tidak dipakai. Riwayat riset dan rancangannya ada di tiket 261112230309 dan 261113230601.

## Concern yang masih terbuka

Daftar lengkap dengan rinciannya di `docs/concern.md`. Yang masih terbuka:

- **Prompt saat start rapuh**: jawaban otomatis dan deteksi "siap" bergantung pada teks layar Claude Code (`I am using this for local development`, `bypass permissions on`). Uji ulang setiap kali Claude Code di-upgrade. Login dan onboarding di server baru belum diuji.
- **Ketahanan**: master-bot sendiri belum dinyalakan otomatis setelah reboot (perlu systemd/launchd atau sejenisnya).
- **Kuota bersama**: semua bot memakai satu akun Claude.
- **Connector pemilik ikut termuat di bot**: connector akun claude.ai dan MCP bawaan tetap termuat di bot yang bebas izin; belum ada cara mematikannya per bot.
- **Workspace bot** jangan diletakkan di dalam repo git atau proyek lain (Claude memuat `CLAUDE.md` dan `.claude/` dari folder induk).
- **Pengaturan user tidak berlaku di bot** (`--setting-sources project,local`): model dan effort default harus diberikan lewat `--settings` atau `--model` kalau perlu.

## Dokumentasi rinci di `docs/`

`CLAUDE.md` hanya pedoman umum. Rincian dibaca saat perlu, dan **wajib** dibaca sebelum mengubah bagian yang disebut:

| Berkas | Isi | Wajib dibaca sebelum |
| :- | :- | :- |
| `docs/master-bot.md` | Perilaku rinci master-bot: konfigurasi, kunci `master.pid`, berhenti dalam 5 detik, menu, setiap perintah (`/register` sampai `/delete`), penyalaan otomatis, `registry.json` | mengubah apa pun di `master/` atau menambah perintah master-bot |
| `docs/menyalakan-bot.md` | Fakta plugin upstream, langkah `start-bot.sh`/`launch.ts`, cara memuat plugin sebagai channel, prompt saat start, banyak bot bersamaan, server plugin yatim dan pembersihannya | mengubah `master/src/launch.ts`, `strays.ts`, `scripts/`, cara start atau berhentinya `plugin/server.ts`, atau meng-upgrade Claude Code |
| `docs/fitur-chat-bot.md` | Fitur plugin di chat bot: `/context` dan bridge statusline, Markdown dan pemotongan balasan, tombol pilihan, `/start` `/help` `/status`, tanpa skill dan pairing, typing dan reaksi, kutipan, dokumen besar, album, pengingat konteks | mengubah apa pun di `plugin/` atau `master/src/statusline.ts` |
| `docs/log-bot.md` | Format dan peristiwa `state/plugin.log`, cara membaca keterlambatan pesan, kejadian keterlambatan pesan pertama | mengubah `plugin/log.ts` atau pencatatan di plugin, dan saat menyelidiki pesan terlambat atau gangguan polling |
| `docs/kuota.md` | Riset sumber kuota akun Claude dan fakta `rate_limits` | mengubah `/quota`, `master/src/quota.ts`, atau pemakaian `status.json` |
| `docs/tes.md` | Cara menjalankan tes, aturan server tiruan, langkah kalau tes gagal acak | menulis tes baru atau menyelidiki tes yang gagal acak |
| `docs/concern.md` | Daftar lengkap concern proyek dan keadaannya | mengubah cara start bot, penanganan token, atau penamaan plugin |

Aturan untuk pekerjaan berikutnya:

- Rincian fitur (perilaku, angka, nama berkas, tes, nomor tiket) ditulis di berkas `docs/` yang sesuai, **bukan** sebagai bagian baru di `CLAUDE.md`. Topik baru yang tidak cocok di berkas mana pun mendapat berkas `docs/` baru dan satu baris di tabel di atas.
- Butir tiket "CLAUDE.md diperbarui" berarti berkas `docs/` yang sesuai diperbarui. `CLAUDE.md` hanya diubah kalau pedoman umumnya berubah (terminologi, keputusan, struktur, jebakan lintas pekerjaan, daftar perintah, concern terbuka, daftar isi `docs/`).
- `CLAUDE.md` dijaga paling banyak 150 baris dan 15 KB.

## Cara bekerja di proyek ini

- Pemilik ingin diajak **berdiskusi dulu** sebelum implementasi. Ajukan rancangan dan concern, tunggu persetujuan.
- Komunikasi dalam Bahasa Indonesia.
- Commit hanya jika diminta.

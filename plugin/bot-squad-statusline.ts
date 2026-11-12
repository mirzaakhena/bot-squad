#!/usr/bin/env bun
/**
 * bot-squad: statusline bridge (tiket 261112230304), mengikuti
 * cc-plugin/bin/statusline-bridge.ts di mirza-bots.
 *
 * Dijalankan Claude Code sebagai `statusLine.command` sesi bot, dipasang
 * master lewat `--settings` saat start:
 *
 *   bun '<repo>/plugin/bot-squad-statusline.ts' '<state dir bot>'
 *
 * Dua tugas, dengan urutan kepentingan yang terbaca dari strukturnya:
 *
 *   1. TERUSKAN payload yang sama ke statusline pendahulu
 *      (<state>/chained-statusline) dan biarkan keluarannya tampil apa
 *      adanya. Ini berjalan apa pun yang terjadi di tugas kedua.
 *   2. TANGKAP payload ke <state>/status.json untuk /context. Dibungkus
 *      try/catch yang menelan semua kesalahan: kalau gagal, /context yang
 *      mengalah, bukan baris status.
 *
 * Berkas ini sendiri tidak pernah mencetak apa pun ke stdout. Hanya boleh
 * mengimpor `node:` dan context.ts (yang juga hanya `node:`): ia dijalankan
 * setiap kali baris status digambar ulang.
 */
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { CHAIN_FILE, STATUS_FILE, planChainInvocation, writeCapturedStatus } from './context.ts'

const stateDir = process.argv[2] ?? ''

let input = ''
try {
  input = readFileSync(0, 'utf8')
} catch {
  input = ''
}

// --- Tugas 2: tangkap (boleh gagal diam-diam) ---
try {
  if (stateDir !== '' && input !== '' && statSync(stateDir).isDirectory()) {
    writeCapturedStatus(join(stateDir, STATUS_FILE), JSON.parse(input), Date.now())
  }
} catch {
  // Sengaja kosong.
}

// --- Tugas 1: teruskan (selalu berjalan) ---
let chain = ''
try {
  if (stateDir !== '') chain = readFileSync(join(stateDir, CHAIN_FILE), 'utf8').trim()
} catch {
  chain = ''
}
// Rantai kosong berarti memang tidak ada pendahulu: master hanya memasang
// bridge setelah pendahulunya dipastikan (master/src/statusline.ts).
if (chain) {
  const plan = planChainInvocation(chain)
  spawnSync(plan.command, {
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: plan.shell,
    windowsHide: true,
    // Baris status yang menggantung membekukan tampilan Claude Code.
    timeout: 5000,
  })
}

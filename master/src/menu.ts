import { GrammyError, type Api } from "grammy";
import type { BotCommandScope } from "grammy/types";
import { COMMANDS } from "./bot.ts";
import { describeError, type Logger } from "./log.ts";

/**
 * Menimpa menu perintah di setiap cakupan yang bisa ditinggalkan bot lain
 * yang pernah memakai token ini. Telegram tidak bisa ditanya cakupan mana saja
 * yang pernah diisi, jadi cakupan ini selalu ditulis ulang setiap start.
 * Menu khusus bahasa tertentu sengaja tidak ditangani.
 *
 * Kegagalan selain 401/409 hanya menjadi peringatan dan langkah berikutnya
 * tetap dicoba; 401/409 dilempar supaya master-bot berhenti.
 */
export async function syncCommandMenu(api: Api, ownerId: number, log: Logger, signal?: AbortSignal): Promise<void> {
  const commands = COMMANDS.map((c) => ({ ...c }));
  const steps: Array<{ label: string; call: () => Promise<unknown> }> = [];
  const set = (label: string, scope: BotCommandScope) =>
    steps.push({ label, call: () => api.setMyCommands(commands, { scope }, signal) });
  const del = (label: string, scope: BotCommandScope) =>
    steps.push({ label, call: () => api.deleteMyCommands({ scope }, signal) });

  set("default", { type: "default" });
  set("all_private_chats", { type: "all_private_chats" });
  set("chat pemilik", { type: "chat", chat_id: ownerId });
  del("all_group_chats", { type: "all_group_chats" });
  del("all_chat_administrators", { type: "all_chat_administrators" });

  for (const step of steps) {
    // Berhenti diminta: langkah sisanya tidak dicoba (tiket 261112235501).
    if (signal?.aborted) return;
    try {
      await step.call();
    } catch (err) {
      if (err instanceof GrammyError && (err.error_code === 401 || err.error_code === 409)) throw err;
      if (signal?.aborted) return;
      log(`peringatan: menu perintah (${step.label}) gagal diperbarui: ${describeError(err)}`);
    }
  }
}

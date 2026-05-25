import type { PluginContext } from "@paperclipai/plugin-sdk";
import { linkPRToCard } from "../db/queries.js";

// Matches: CARD-123, ABC-42, PROJ-1 (uppercase prefix + number)
const KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
// Matches: #123 (hash + number, common in Paperclip issue references)
const HASH_PATTERN = /#(\d+)\b/g;

export function extractCardIds(branch: string, title: string): string[] {
  const text = `${branch} ${title}`;
  const ids = new Set<string>();

  for (const match of text.matchAll(KEY_PATTERN)) {
    ids.add(match[1]);
  }
  for (const match of text.matchAll(HASH_PATTERN)) {
    ids.add(`#${match[1]}`);
  }

  return [...ids];
}

export async function detectAndLinkCards(
  ctx: PluginContext,
  prId: number,
  branch: string,
  title: string,
): Promise<string[]> {
  const cardIds = extractCardIds(branch, title);
  for (const cardId of cardIds) {
    await linkPRToCard(ctx.db, prId, cardId, "pattern");
  }
  return cardIds;
}

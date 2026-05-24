import type { ShortcutDefinition } from "./types";

export type ShortcutConflict = {
  keys: string;
  shortcutIds: string[];
};

function normalizeToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (normalized === "escape") {
    return "esc";
  }

  return normalized;
}

function normalizeCombo(combo: string): string | undefined {
  const tokens = combo
    .split("+")
    .map((token) => normalizeToken(token))
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return undefined;
  }

  const key = tokens[tokens.length - 1];
  if (!key) {
    return undefined;
  }

  const modifiers = tokens.slice(0, -1);
  const validModifiers = new Set(["ctrl", "command", "shift", "alt"]);
  if (!modifiers.every((modifier) => validModifiers.has(modifier))) {
    return undefined;
  }

  const uniqueModifiers = [...new Set(modifiers)].sort();
  return [...uniqueModifiers, key].join("+");
}

export function normalizeKeysString(keys: string): string | undefined {
  const normalizedCombos = keys
    .split(",")
    .map((combo) => normalizeCombo(combo))
    .filter((combo): combo is string => Boolean(combo));
  if (normalizedCombos.length === 0) {
    return undefined;
  }

  return [...new Set(normalizedCombos)].join(",");
}

export function detectShortcutConflicts(definitions: readonly ShortcutDefinition[]): ShortcutConflict[] {
  const shortcutIdsByCombo = new Map<string, Set<string>>();
  for (const definition of definitions) {
    const normalized = normalizeKeysString(definition.keys);
    if (!normalized) {
      continue;
    }

    for (const combo of normalized.split(",")) {
      const shortcutIds = shortcutIdsByCombo.get(combo) ?? new Set<string>();
      shortcutIds.add(definition.id);
      shortcutIdsByCombo.set(combo, shortcutIds);
    }
  }

  return [...shortcutIdsByCombo.entries()]
    .filter(([, shortcutIds]) => shortcutIds.size > 1)
    .map(([keys, shortcutIds]) => ({
      keys,
      shortcutIds: [...shortcutIds],
    }));
}

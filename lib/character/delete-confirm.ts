/**
 * The single source of truth for the "type the name to confirm deletion" match, shared by
 * the client dialog (`delete-character-dialog.tsx`) and the server action
 * (`deleteCharacterAction`) so the two sides can never disagree about what satisfies the
 * check (an adversarial review caught the client comparing untrimmed-exact while the
 * server trimmed only its side — whitespace-padded names were unsatisfiable both ways).
 *
 * Rules:
 * - Both sides are compared TRIMMED (leading/trailing whitespace never blocks a delete),
 *   but the comparison stays case-sensitive on the trimmed values.
 * - A character whose stored name trims to empty (the name field has no min-length) falls
 *   back to typing the literal word DELETE — otherwise `typed === ""` could never pass a
 *   non-empty guard and the character would be impossible to delete.
 */
export const DELETE_CONFIRM_FALLBACK = "DELETE";

/** What the user must type: the trimmed character name, or DELETE when the name is blank. */
export function deleteConfirmTarget(characterName: string): string {
  const trimmed = characterName.trim();
  return trimmed.length > 0 ? trimmed : DELETE_CONFIRM_FALLBACK;
}

/** True when the typed value satisfies the confirmation for this character name. */
export function deleteConfirmMatches(typed: string, characterName: string): boolean {
  return typed.trim() === deleteConfirmTarget(characterName);
}

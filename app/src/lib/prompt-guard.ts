/**
 * gpt-image-2 is the only model this studio generates with, and it has no alpha channel — every
 * request now hard-codes `background: 'opaque'` (see Create.tsx). Nothing stops the prompt TEXT
 * from still claiming transparency: a draft written before the studio went single-model, or a
 * hand-edit in raw mode, can still say "isolated on a transparent background".
 *
 * That mismatch is probe-verified to NOT error. The model silently paints a fake transparency
 * checkerboard into the opaque pixels instead — output has no alpha (PNG colortype 2), and the
 * checkerboard is baked-in garbage, not a background that can be keyed out afterwards. This guard
 * exists solely to warn about that exact failure mode before a user hits it again.
 */
const TRANSPARENCY_CLAIM_PATTERN =
  /transparent background|transparent bg|on transparency|with transparency|without a background|without background|no background|remove the background|background removed|cut-?out|cut out|alpha channel|checkerboard/i

/** Returns the matched phrase (original casing, for display) or `null` if the prompt makes no
 * transparency claim. Case-insensitive; does not judge intent beyond the fixed phrase list. */
export function detectTransparencyClaim(prompt: string): string | null {
  const match = TRANSPARENCY_CLAIM_PATTERN.exec(prompt)
  return match ? match[0] : null
}

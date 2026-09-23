/**
 * Both generatable models (`gpt-image-2.5-flare`/`sunburst`) have a real alpha channel — a
 * transparent background is producible again. The rule is no longer a flat prohibition: prompt
 * TEXT must match the `background` parameter the request actually sends.
 *
 * Probe-verified failure mode (still true on the 2.5 models, unchanged): send
 * `background: "opaque"` while the prompt claims transparency, and the model doesn't ignore the
 * mismatch — it paints a fake transparency checkerboard into the opaque pixels instead. Output has
 * no alpha (PNG colortype 2), and the checkerboard is baked-in garbage, not a real background that
 * can be keyed out afterwards. So: the claim is only a problem when `background` disagrees with it.
 */
const TRANSPARENCY_CLAIM_PATTERN =
  /transparent background|transparent bg|on transparency|with transparency|without a background|without background|no background|remove the background|background removed|cut-?out|cut out|alpha channel|checkerboard/i

/** Returns the matched phrase (original casing, for display) or `null` if the prompt makes no
 * transparency claim. Case-insensitive; does not judge intent beyond the fixed phrase list. */
export function detectTransparencyClaim(prompt: string): string | null {
  const match = TRANSPARENCY_CLAIM_PATTERN.exec(prompt)
  return match ? match[0] : null
}

/**
 * True when the prompt's transparency claim (if any) contradicts the request's `background`
 * value — the exact condition that triggers the checkerboard failure mode. A transparency claim
 * alongside `background: "transparent"` is correct and expected; only `opaque`/`auto` disagree
 * with it.
 */
export function transparencyClaimMismatchesBackground(
  prompt: string,
  background: 'transparent' | 'opaque' | 'auto',
): string | null {
  const claim = detectTransparencyClaim(prompt)
  if (!claim) return null
  return background === 'transparent' ? null : claim
}

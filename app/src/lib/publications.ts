/**
 * Pure half of the Share/Publish write path — computing the next `publications[]` array for a
 * patch. `library.ts#updateGenerationMetadata` does the actual disk write; kept separate for the
 * same reason as `roles.ts`: the decision logic is unit-testable without a Tauri runtime.
 */
import type { GenerationPublication, PublicationTarget } from '@image-gen/shared'

/** Finds the existing delivery record for `target`, if the generation has one. Used both to
 * render the "already shared/published" UI and to decide whether Publish needs to share first. */
export function findPublication(
  publications: GenerationPublication[] | undefined,
  target: PublicationTarget,
): GenerationPublication | undefined {
  return publications?.find((publication) => publication.target === target)
}

/** Returns a copy of `publications` with `next` upserted by target — replaces any existing
 * record for the same target rather than appending a duplicate, so re-sharing/re-publishing
 * updates the one record in place. */
export function withPublication(
  publications: GenerationPublication[] | undefined,
  next: GenerationPublication,
): GenerationPublication[] {
  const rest = (publications ?? []).filter((publication) => publication.target !== next.target)
  return [...rest, next]
}

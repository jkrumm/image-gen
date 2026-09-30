/**
 * WORKAROUND — basalt-ui 1.32.0 documents `import { CONTAINER_CLASSES } from 'basalt-ui/tokens'`
 * (MIGRATING § 1.32.0) but ships it only in the unexported `dist/tokens/size-classes`. Mirror of
 * those values; delete this file and import from `basalt-ui/tokens` once it is re-exported.
 */
export const CONTAINER_CLASSES = { micro: 0, compact: 240, regular: 480, wide: 800 } as const

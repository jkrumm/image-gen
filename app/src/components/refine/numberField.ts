/** Mantine `NumberInput.onChange` hands back `string | number` (it can be a bare string mid-edit)
 * — mirrors the parsing `Edit.tsx` already does at its own `NumberInput` call sites. */
export function parseNumberInput(value: string | number, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

type Fields = Record<string, unknown>

export function log(event: string, fields: Fields = {}): void {
  // oxlint-disable-next-line no-console -- this IS the structured JSON logging sink
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }))
}

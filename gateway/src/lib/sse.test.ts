import { describe, expect, test } from 'bun:test'
import { mapPartialImageFrame, parseSSEFrame, readSSEFrames } from './sse.js'

const PARTIAL_IMAGE_FRAME =
  'event: image_generation.partial_image\ndata: {"created_at":1784209980,"type":"image_generation.partial_image","b64_json":"AAA=","background":"opaque","output_format":"png","partial_image_index":0,"quality":"low","sequence_number":0,"size":"1024x1024"}'

const COMPLETED_FRAME =
  'event: image_generation.completed\ndata: {"created_at":1784209985,"type":"image_generation.completed","b64_json":"BBB=","background":"opaque","output_format":"png","quality":"low","sequence_number":1,"size":"1024x1024","usage":{"input_tokens":9,"output_tokens":273,"total_tokens":282}}'

describe('parseSSEFrame', () => {
  test('parses a partial_image frame', () => {
    const frame = parseSSEFrame(PARTIAL_IMAGE_FRAME)
    expect(frame?.event).toBe('image_generation.partial_image')
    expect(frame?.data).toMatchObject({ b64_json: 'AAA=', partial_image_index: 0 })
  })

  test('parses a completed frame with usage', () => {
    const frame = parseSSEFrame(COMPLETED_FRAME)
    expect(frame?.event).toBe('image_generation.completed')
    expect(frame?.data).toMatchObject({ b64_json: 'BBB=', usage: { total_tokens: 282 } })
  })

  test('returns null for a frame missing an event name', () => {
    expect(parseSSEFrame('data: {"foo":1}')).toBeNull()
  })

  test('returns null for a frame missing data', () => {
    expect(parseSSEFrame('event: image_generation.completed')).toBeNull()
  })

  test('returns null for unparseable JSON', () => {
    expect(parseSSEFrame('event: foo\ndata: not json')).toBeNull()
  })
})

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe('readSSEFrames', () => {
  test('splits a byte stream into frames on blank lines', async () => {
    const body = streamOf(`${PARTIAL_IMAGE_FRAME}\n\n${COMPLETED_FRAME}\n\n`)
    const frames: string[] = []
    for await (const frame of readSSEFrames(body)) frames.push(frame)
    expect(frames).toHaveLength(2)
    expect(frames[0]).toContain('partial_image')
    expect(frames[1]).toContain('completed')
  })

  test('yields a trailing frame with no closing blank line', async () => {
    const body = streamOf(PARTIAL_IMAGE_FRAME)
    const frames: string[] = []
    for await (const frame of readSSEFrames(body)) frames.push(frame)
    expect(frames).toHaveLength(1)
  })
})

describe('mapPartialImageFrame', () => {
  test('maps upstream data into our wire shape, using the upstream format', () => {
    const event = mapPartialImageFrame(
      { b64_json: 'AAA=', partial_image_index: 2, output_format: 'webp' },
      'png',
    )
    expect(event).toEqual({
      type: 'partial_image',
      partial_image_index: 2,
      b64_json: 'AAA=',
      format: 'webp',
    })
  })

  test('falls back to the requested format when upstream omits output_format', () => {
    const event = mapPartialImageFrame({ b64_json: 'AAA=', partial_image_index: 0 }, 'jpeg')
    expect(event).toMatchObject({ format: 'jpeg' })
  })
})

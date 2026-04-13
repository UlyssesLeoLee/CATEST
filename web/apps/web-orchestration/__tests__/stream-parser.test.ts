/**
 * stream-parser.test.ts
 *
 * Unit tests for the SSE stream parsing logic that lives in useBridgeStream
 * inside page.tsx.  We replicate the exact parsing algorithm from the hook and
 * test it exhaustively without needing to mount any React components.
 *
 * The algorithm (verbatim from page.tsx):
 *
 *   buffer += decoded chunk
 *   lines  = buffer.split("\n")
 *   buffer = lines.pop()        // last (possibly incomplete) line stays in buffer
 *   for line of lines:
 *     if !line.startsWith("data: ") → skip
 *     jsonStr = line.slice(6).trim()
 *     if !jsonStr → skip
 *     try { ev = JSON.parse(jsonStr) } catch { skip }
 *     if ev.event === "end" || ev.event === "timeout" → call onDone, return
 *     else → call onEvent(ev)
 */

import { describe, it, expect, vi } from 'vitest'

// ─── Replicated parser ────────────────────────────────────────────────────────

interface StreamEvent {
  event: string
  content?: string
  tool?: string
  input?: string
  message?: string
  subtype?: string
  cost_usd?: number
  duration_ms?: number
  num_turns?: number
  target?: string
  data?: string
}

/**
 * Parse one or more raw SSE chunks (already decoded from Uint8Array) through
 * the same buffer-splitting logic the real hook uses.
 *
 * Returns { events, done } where:
 *   events = every StreamEvent that was emitted via onEvent()
 *   done   = whether onDone() was called
 */
function parseChunks(chunks: string[]): { events: StreamEvent[]; done: boolean } {
  const events: StreamEvent[] = []
  let done = false
  let buffer = ''

  for (const chunk of chunks) {
    buffer += chunk

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (!jsonStr) continue
      try {
        const ev: StreamEvent = JSON.parse(jsonStr)
        if (ev.event === 'end' || ev.event === 'timeout') {
          done = true
          return { events, done }
        }
        events.push(ev)
      } catch {
        // skip malformed JSON
      }
    }
  }

  return { events, done }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SSE line prefix filtering', () => {
  it('ignores lines that do not start with "data: "', () => {
    const { events } = parseChunks([
      'event: message\n',
      'id: 42\n',
      'retry: 3000\n',
      ': this is a comment\n',
      '\n',
    ])
    expect(events).toHaveLength(0)
  })

  it('parses lines that start with "data: "', () => {
    const { events } = parseChunks([
      'data: {"event":"status","message":"ok"}\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('status')
    expect(events[0].message).toBe('ok')
  })

  it('skips "data: " lines with empty payload after trim', () => {
    const { events } = parseChunks(['data:   \n'])
    expect(events).toHaveLength(0)
  })

  it('skips "data:" with no space after colon (does not match prefix)', () => {
    const { events } = parseChunks(['data:{"event":"status","message":"no-space"}\n'])
    // "data:{" does not start with "data: " (note the space)
    expect(events).toHaveLength(0)
  })
})

describe('JSON parsing', () => {
  it('parses a well-formed status event', () => {
    const { events } = parseChunks([
      'data: {"event":"status","message":"Focusing IDE"}\n',
    ])
    expect(events[0]).toMatchObject({ event: 'status', message: 'Focusing IDE' })
  })

  it('parses a well-formed text event', () => {
    const { events } = parseChunks([
      'data: {"event":"text","content":"Hello world"}\n',
    ])
    expect(events[0]).toMatchObject({ event: 'text', content: 'Hello world' })
  })

  it('parses a tool_use event with tool name and input', () => {
    const { events } = parseChunks([
      'data: {"event":"tool_use","tool":"read_file","input":"src/main.ts"}\n',
    ])
    expect(events[0]).toMatchObject({
      event: 'tool_use',
      tool: 'read_file',
      input: 'src/main.ts',
    })
  })

  it('parses a tool_result event', () => {
    const { events } = parseChunks([
      'data: {"event":"tool_result","content":"file data here"}\n',
    ])
    expect(events[0]).toMatchObject({ event: 'tool_result', content: 'file data here' })
  })

  it('parses a result event with cost, duration, num_turns', () => {
    const { events } = parseChunks([
      'data: {"event":"result","subtype":"success","cost_usd":0.0042,"duration_ms":3200,"num_turns":4}\n',
    ])
    expect(events[0]).toMatchObject({
      event: 'result',
      subtype: 'success',
      cost_usd: 0.0042,
      duration_ms: 3200,
      num_turns: 4,
    })
  })

  it('parses an error event', () => {
    const { events } = parseChunks([
      'data: {"event":"error","message":"Tool timed out"}\n',
    ])
    expect(events[0]).toMatchObject({ event: 'error', message: 'Tool timed out' })
  })

  it('silently skips malformed JSON', () => {
    const { events } = parseChunks([
      'data: {not valid json}\n',
      'data: {"event":"status","message":"after bad"}\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('after bad')
  })

  it('silently skips truncated JSON', () => {
    const { events } = parseChunks([
      'data: {"event":"text","cont\n', // truncated
      'data: {"event":"status","message":"good"}\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('good')
  })

  it('silently skips empty JSON object (no event key crash)', () => {
    const { events } = parseChunks([
      'data: {}\n',
      'data: {"event":"status","message":"fine"}\n',
    ])
    // {} is valid JSON but has no .event that matches "end"/"timeout", so it
    // is emitted as-is
    expect(events).toHaveLength(2)
    expect(events[1].message).toBe('fine')
  })

  it('handles JSON with unicode characters', () => {
    const { events } = parseChunks([
      'data: {"event":"text","content":"你好世界 🚀"}\n',
    ])
    expect(events[0].content).toBe('你好世界 🚀')
  })
})

describe('"end" and "timeout" termination events', () => {
  it('"end" event sets done=true and emits no event', () => {
    const { events, done } = parseChunks([
      'data: {"event":"end"}\n',
    ])
    expect(done).toBe(true)
    expect(events).toHaveLength(0)
  })

  it('"timeout" event sets done=true and emits no event', () => {
    const { events, done } = parseChunks([
      'data: {"event":"timeout"}\n',
    ])
    expect(done).toBe(true)
    expect(events).toHaveLength(0)
  })

  it('events before "end" are emitted, events after are not', () => {
    const { events, done } = parseChunks([
      'data: {"event":"status","message":"step 1"}\n',
      'data: {"event":"status","message":"step 2"}\n',
      'data: {"event":"end"}\n',
      'data: {"event":"status","message":"should not appear"}\n',
    ])
    expect(done).toBe(true)
    expect(events).toHaveLength(2)
    expect(events.map(e => e.message)).toEqual(['step 1', 'step 2'])
  })

  it('"done" event (not "end") is emitted as a normal event', () => {
    // page.tsx only stops on "end" | "timeout", so "done" goes through
    const { events, done } = parseChunks([
      'data: {"event":"done"}\n',
    ])
    expect(done).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('done')
  })
})

describe('chunk buffering — incomplete lines spanning multiple chunks', () => {
  it('correctly assembles a line split across two chunks', () => {
    const { events } = parseChunks([
      'data: {"event":"text","co',   // split mid-JSON
      'ntent":"reassembled"}\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].content).toBe('reassembled')
  })

  it('correctly assembles a line split at the "data: " prefix boundary', () => {
    const { events } = parseChunks([
      'dat',
      'a: {"event":"status","message":"partial prefix"}\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('partial prefix')
  })

  it('handles multiple lines in one chunk', () => {
    const { events } = parseChunks([
      'data: {"event":"status","message":"a"}\ndata: {"event":"status","message":"b"}\n',
    ])
    expect(events).toHaveLength(2)
    expect(events.map(e => e.message)).toEqual(['a', 'b'])
  })

  it('handles a trailing incomplete line that never arrives (no newline at end)', () => {
    // The last line has no trailing newline — it stays in the buffer and is never processed
    const { events } = parseChunks([
      'data: {"event":"status","message":"complete"}\n',
      'data: {"event":"status","message":"incomplete"',  // no \n
    ])
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('complete')
  })

  it('processes 3-chunk reassembly correctly', () => {
    const { events } = parseChunks([
      'data: {"event"',
      ':"text","conte',
      'nt":"three chunks"}\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].content).toBe('three chunks')
  })

  it('handles SSE double-newline separators (blank lines)', () => {
    // SSE spec uses double \n\n to terminate an event frame
    const { events } = parseChunks([
      'data: {"event":"status","message":"with blank line"}\n\n',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('with blank line')
  })
})

describe('real-world SSE stream simulation', () => {
  it('processes a full realistic SSE stream', () => {
    const chunks = [
      `data: {"event":"start","target":"claude_code","trace_id":"abc-123"}\n\n`,
      `data: {"event":"status","message":"Focusing Claude Code IDE..."}\n\n`,
      `data: {"event":"status","message":"Prompt pasted into Claude Code \u2713"}\n\n`,
      `data: {"event":"text","content":"Here is the solution:"}\n\n`,
      `data: {"event":"tool_use","tool":"write_file","input":"src/solution.ts"}\n\n`,
      `data: {"event":"tool_result","content":"File written successfully"}\n\n`,
      `data: {"event":"result","subtype":"success","cost_usd":0.0091,"duration_ms":8200,"num_turns":6}\n\n`,
      `data: {"event":"done"}\n\n`,
      `data: {"event":"end"}\n\n`,
    ]

    const { events, done } = parseChunks(chunks)

    expect(done).toBe(true)
    expect(events.map(e => e.event)).toEqual([
      'start',
      'status',
      'status',
      'text',
      'tool_use',
      'tool_result',
      'result',
      'done',
    ])
  })

  it('handles a stream with mixed good and bad JSON lines', () => {
    const chunks = [
      'data: {"event":"status","message":"ok1"}\n',
      'data: GARBAGE_NOT_JSON\n',
      'data: {"event":"status","message":"ok2"}\n',
      'data: {broken\n',
      'data: {"event":"end"}\n',
    ]
    const { events, done } = parseChunks(chunks)
    expect(done).toBe(true)
    expect(events).toHaveLength(2)
    expect(events.map(e => e.message)).toEqual(['ok1', 'ok2'])
  })

  it('handles a completely empty stream', () => {
    const { events, done } = parseChunks([])
    expect(events).toHaveLength(0)
    expect(done).toBe(false)
  })

  it('handles a stream with only blank lines', () => {
    const { events, done } = parseChunks(['\n\n\n\n'])
    expect(events).toHaveLength(0)
    expect(done).toBe(false)
  })

  it('handles chunking that splits across the newline character', () => {
    const { events } = parseChunks([
      'data: {"event":"text","content":"split newline"}',
      '\n',
      'data: {"event":"status","message":"after newline"}\n',
    ])
    expect(events).toHaveLength(2)
    expect(events[0].content).toBe('split newline')
    expect(events[1].message).toBe('after newline')
  })
})

describe('cost/duration formatting (as used in StreamEventBlock)', () => {
  it('cost_usd formatted to 4 decimal places', () => {
    const cost = 0.004200
    expect(cost.toFixed(4)).toBe('0.0042')
  })

  it('cost_usd with many decimals rounds correctly', () => {
    const cost = 0.00419999
    expect(cost.toFixed(4)).toBe('0.0042')
  })

  it('duration_ms converted to seconds with 1 decimal', () => {
    expect((3200 / 1000).toFixed(1)).toBe('3.2')
    expect((500 / 1000).toFixed(1)).toBe('0.5')
    expect((10000 / 1000).toFixed(1)).toBe('10.0')
  })

  it('num_turns is an integer', () => {
    const ev: StreamEvent = {
      event: 'result',
      num_turns: 7,
    }
    expect(Number.isInteger(ev.num_turns)).toBe(true)
    expect(`${ev.num_turns} turns`).toBe('7 turns')
  })
})

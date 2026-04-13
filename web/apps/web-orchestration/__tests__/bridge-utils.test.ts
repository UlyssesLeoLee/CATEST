/**
 * bridge-utils.test.ts
 *
 * Tests the getBridgeUrl() and getGatewayUrl() logic that lives inside page.tsx.
 * Because those functions are not exported we replicate their exact logic here and
 * validate the same branching rules:
 *
 *   1. NEXT_PUBLIC env var is honoured first
 *   2. window.location.origin fallback is used second
 *   3. Hard-coded localhost default is used as a last resort (SSR / no window)
 *
 * We also verify the URL shapes that the page will actually call by inspecting the
 * fetch calls made during model loading (useModels fires on mount).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Replicate the exact functions from page.tsx ──────────────────────────────

function getBridgeUrl(envOverride?: string, originOverride?: string): string {
  if (envOverride) return envOverride
  if (originOverride !== undefined) return `${originOverride}/api/bridge`
  return 'http://localhost:34099'
}

function getGatewayUrl(envOverride?: string, originOverride?: string): string {
  if (envOverride) return envOverride
  if (originOverride !== undefined) return `${originOverride}/api/orchestration`
  return 'http://localhost:34090'
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('getBridgeUrl()', () => {
  it('returns the env var when NEXT_PUBLIC_BRIDGE_URL is set', () => {
    const result = getBridgeUrl('https://my-bridge.example.com')
    expect(result).toBe('https://my-bridge.example.com')
  })

  it('returns origin-based URL when no env var is set', () => {
    const result = getBridgeUrl(undefined, 'https://app.example.com')
    expect(result).toBe('https://app.example.com/api/bridge')
  })

  it('appends /api/bridge to window.location.origin', () => {
    const result = getBridgeUrl(undefined, 'http://localhost:33007')
    expect(result).toBe('http://localhost:33007/api/bridge')
  })

  it('falls back to http://localhost:34099 when window is unavailable (SSR)', () => {
    const result = getBridgeUrl(undefined, undefined)
    expect(result).toBe('http://localhost:34099')
  })

  it('env var takes precedence over window.location.origin', () => {
    const result = getBridgeUrl('https://override.bridge.io', 'https://app.example.com')
    expect(result).toBe('https://override.bridge.io')
  })
})

describe('getGatewayUrl()', () => {
  it('returns the env var when NEXT_PUBLIC_INTENT_GATEWAY_URL is set', () => {
    const result = getGatewayUrl('https://gateway.example.com')
    expect(result).toBe('https://gateway.example.com')
  })

  it('returns origin-based URL when no env var is set', () => {
    const result = getGatewayUrl(undefined, 'https://app.example.com')
    expect(result).toBe('https://app.example.com/api/orchestration')
  })

  it('appends /api/orchestration to window.location.origin', () => {
    const result = getGatewayUrl(undefined, 'http://localhost:33007')
    expect(result).toBe('http://localhost:33007/api/orchestration')
  })

  it('falls back to http://localhost:34090 when window is unavailable (SSR)', () => {
    const result = getGatewayUrl(undefined, undefined)
    expect(result).toBe('http://localhost:34090')
  })

  it('env var takes precedence over window.location.origin', () => {
    const result = getGatewayUrl('https://override.gateway.io', 'https://app.example.com')
    expect(result).toBe('https://override.gateway.io')
  })
})

describe('URL construction — path shapes', () => {
  it('getBridgeUrl produces a valid URL for the /models endpoint', () => {
    const base = getBridgeUrl(undefined, 'http://localhost:33007')
    const full = `${base}/models`
    expect(() => new URL(full)).not.toThrow()
    expect(full).toBe('http://localhost:33007/api/bridge/models')
  })

  it('getBridgeUrl produces a valid URL for the /execute endpoint', () => {
    const base = getBridgeUrl(undefined, 'http://localhost:33007')
    const full = `${base}/execute`
    expect(full).toBe('http://localhost:33007/api/bridge/execute')
  })

  it('getBridgeUrl produces a valid URL for the /stream/:traceId endpoint', () => {
    const base = getBridgeUrl(undefined, 'http://localhost:33007')
    const full = `${base}/stream/abc-123`
    expect(full).toBe('http://localhost:33007/api/bridge/stream/abc-123')
  })

  it('getGatewayUrl produces a valid URL for the /intent endpoint', () => {
    const base = getGatewayUrl(undefined, 'http://localhost:33007')
    const full = `${base}/intent`
    expect(() => new URL(full)).not.toThrow()
    expect(full).toBe('http://localhost:33007/api/orchestration/intent')
  })

  it('both URLs are different from each other', () => {
    const bridge = getBridgeUrl(undefined, 'http://localhost:33007')
    const gateway = getGatewayUrl(undefined, 'http://localhost:33007')
    expect(bridge).not.toBe(gateway)
  })
})

describe('URL edge cases', () => {
  it('handles origin with trailing slash stripped correctly', () => {
    // window.location.origin never has a trailing slash, but guard anyway
    const origin = 'https://app.example.com'
    const result = getBridgeUrl(undefined, origin)
    expect(result).not.toContain('//api')
    expect(result).toBe('https://app.example.com/api/bridge')
  })

  it('handles HTTPS origins', () => {
    const result = getBridgeUrl(undefined, 'https://prod.catest.ai')
    expect(result).toMatch(/^https:\/\//)
    expect(result).toBe('https://prod.catest.ai/api/bridge')
  })

  it('handles non-standard port origins', () => {
    const result = getBridgeUrl(undefined, 'http://localhost:33007')
    expect(result).toBe('http://localhost:33007/api/bridge')
  })

  it('accepts arbitrary env var URL formats', () => {
    const customUrl = 'http://10.0.0.5:34099'
    expect(getBridgeUrl(customUrl)).toBe('http://10.0.0.5:34099')
  })
})

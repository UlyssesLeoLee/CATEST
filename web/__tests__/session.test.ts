/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encrypt, decrypt } from '../src/lib/session'

// Mock environment
process.env.JWT_HS256_SECRET = 'test-secret-123-456-789-000-111-222'

describe('JWT Session Encryption', () => {
  const payload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user',
    sessionId: 'session-456',
    plan: 'prestige'
  }

  it('should encrypt and decrypt a payload correctly', async () => {
    const token = await encrypt(payload)
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')

    const decoded = await decrypt(token)
    expect(decoded).toMatchObject(payload)
  })

  it('should return null for an invalid token', async () => {
    const decoded = await decrypt('invalid-token')
    expect(decoded).toBeNull()
  })

  it('should return null if secret changes', async () => {
    const token = await encrypt(payload)
    
    // Change secret
    const originalSecret = process.env.JWT_HS256_SECRET
    process.env.JWT_HS256_SECRET = 'different-secret'
    
    const decoded = await decrypt(token)
    expect(decoded).toBeNull()
    
    // Restore secret
    process.env.JWT_HS256_SECRET = originalSecret
  })
})

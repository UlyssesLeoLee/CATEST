/**
 * auth.test.ts
 *
 * Unit tests for all auth server-actions in src/app/actions/auth.ts.
 * All external dependencies are mocked:
 *   - @/lib/db        → query()
 *   - @/lib/mailer    → sendVerificationEmail()
 *   - @/lib/session   → createSession / invalidateSession / getSession
 *   - bcryptjs        → compare / hash
 *
 * No database, SMTP server, or real file system is needed.
 */

/** @vitest-environment node */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = vi.fn()
vi.mock('@/lib/db', () => ({ query: mockQuery }))

const mockSendVerificationEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/mailer', () => ({ sendVerificationEmail: mockSendVerificationEmail }))

const mockCreateSession    = vi.fn().mockResolvedValue(undefined)
const mockInvalidateSession = vi.fn().mockResolvedValue(undefined)
const mockGetSession       = vi.fn()
vi.mock('@/lib/session', () => ({
  createSession:    (...args: unknown[]) => mockCreateSession(...args),
  invalidateSession: (...args: unknown[]) => mockInvalidateSession(...args),
  getSession:       () => mockGetSession(),
}))

const mockBcryptCompare = vi.fn()
const mockBcryptHash    = vi.fn()
vi.mock('bcryptjs', () => ({
  default: { compare: (...a: unknown[]) => mockBcryptCompare(...a), hash: (...a: unknown[]) => mockBcryptHash(...a) },
  compare: (...a: unknown[]) => mockBcryptCompare(...a),
  hash:    (...a: unknown[]) => mockBcryptHash(...a),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal pg-style result object */
function pgResult(rows: Record<string, unknown>[], rowCount = rows.length) {
  return { rows, rowCount }
}

// ─── Import SUT (after mocks are registered) ─────────────────────────────────

const { loginUser, startRegistration, completeRegistration, requestPasswordReset, resetPassword, logout } =
  await import('../src/app/actions/auth')

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockBcryptHash.mockResolvedValue('$2a$10$hashedpassword')
})

// ─── loginUser ────────────────────────────────────────────────────────────────

describe('loginUser()', () => {
  it('returns error when user is not found', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([], 0))
    const result = await loginUser('unknown@example.com', 'pass')
    expect(result).toEqual({ error: 'Invalid identity or security key' })
  })

  it('returns error when account is disabled', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([{
      id: '1', email: 'a@b.com', role: 'user', status: 'disabled',
      password_hash: 'hash', plan: 'free',
    }]))
    const result = await loginUser('a@b.com', 'pass')
    expect(result).toEqual({ error: 'Access revoked: Account disabled' })
  })

  it('returns error when password does not match', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([{
      id: '1', email: 'a@b.com', role: 'user', status: 'active',
      password_hash: '$2a$10$wronghash', plan: 'free',
    }]))
    mockBcryptCompare.mockResolvedValueOnce(false)
    const result = await loginUser('a@b.com', 'wrongpass')
    expect(result).toEqual({ error: 'Invalid identity or security key' })
  })

  it('returns success and creates session on valid credentials', async () => {
    const user = { id: 'u1', email: 'a@b.com', role: 'user', status: 'active', password_hash: '$2a$10$ok', plan: 'prestige' }
    mockQuery
      .mockResolvedValueOnce(pgResult([user]))   // SELECT user
      .mockResolvedValueOnce(pgResult([]))         // UPDATE last_login
    mockBcryptCompare.mockResolvedValueOnce(true)

    const result = await loginUser('a@b.com', 'correctpass')

    expect(result).toEqual({ success: true })
    expect(mockCreateSession).toHaveBeenCalledWith('u1', 'a@b.com', 'user', 'prestige')
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('returns system error when db throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))
    const result = await loginUser('a@b.com', 'pass')
    expect(result).toEqual({ error: 'System error during authentication' })
  })

  it('defaults plan to "free" when no active license', async () => {
    const user = { id: 'u2', email: 'a@b.com', role: 'user', status: 'active', password_hash: 'h', plan: 'free' }
    mockQuery
      .mockResolvedValueOnce(pgResult([user]))
      .mockResolvedValueOnce(pgResult([]))
    mockBcryptCompare.mockResolvedValueOnce(true)

    await loginUser('a@b.com', 'pass')
    expect(mockCreateSession).toHaveBeenCalledWith('u2', 'a@b.com', 'user', 'free')
  })
})

// ─── startRegistration ────────────────────────────────────────────────────────

describe('startRegistration()', () => {
  it('returns error when email already exists', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([{ id: 'u1' }], 1))
    const result = await startRegistration('existing@b.com', 'pass')
    expect(result).toEqual({ error: 'Identity already exists in system' })
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('inserts verification code and sends email on success', async () => {
    mockQuery
      .mockResolvedValueOnce(pgResult([], 0))   // collision check
      .mockResolvedValueOnce(pgResult([]))        // INSERT verification_codes
    mockBcryptHash.mockResolvedValueOnce('$2a$10$newhash')

    const result = await startRegistration('new@b.com', 'password123')

    expect(result).toEqual({ success: true })
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('new@b.com', expect.stringMatching(/^\d{6}$/))
    // Verify an INSERT was made with the correct email
    const insertCall = mockQuery.mock.calls[1]
    expect(insertCall[1][0]).toBe('new@b.com')
  })

  it('uses fixed code "123456" for admin email (SMTP_USER env bypass)', async () => {
    process.env.SMTP_USER = 'admin@catest.ai'
    mockQuery
      .mockResolvedValueOnce(pgResult([], 0))
      .mockResolvedValueOnce(pgResult([]))

    await startRegistration('admin@catest.ai', 'adminpass')

    expect(mockSendVerificationEmail).toHaveBeenCalledWith('admin@catest.ai', '123456')
    delete process.env.SMTP_USER
  })

  it('returns error when db throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB timeout'))
    const result = await startRegistration('x@b.com', 'pass')
    expect(result).toEqual({ error: 'Failed to dispatch verification code' })
  })
})

// ─── completeRegistration ─────────────────────────────────────────────────────

describe('completeRegistration()', () => {
  it('returns error when verification session not found', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([], 0))
    const result = await completeRegistration('x@b.com', '123456')
    expect(result).toEqual({ error: 'Session expired or not found' })
  })

  it('returns error when code is expired', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    mockQuery.mockResolvedValueOnce(pgResult([{
      code: '123456',
      payload: { passwordHash: '$hash' },
      expires_at: pastDate,
    }]))
    // DELETE cleanup
    mockQuery.mockResolvedValueOnce(pgResult([]))

    const result = await completeRegistration('x@b.com', '123456')
    expect(result).toEqual({ error: 'Verification code expired' })
  })

  it('returns error when code does not match', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    mockQuery.mockResolvedValueOnce(pgResult([{
      code: '999999',
      payload: { passwordHash: '$hash' },
      expires_at: futureDate,
    }]))
    const result = await completeRegistration('x@b.com', '000000')
    expect(result).toEqual({ error: 'Invalid audit code' })
  })

  it('creates user, cleans up code, provisions license and creates session on success', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    mockQuery
      .mockResolvedValueOnce(pgResult([{ code: '123456', payload: { passwordHash: '$2a$10$h' }, expires_at: futureDate }]))
      .mockResolvedValueOnce(pgResult([{ id: 'new-u', email: 'x@b.com', role: 'user' }]))  // INSERT user
      .mockResolvedValueOnce(pgResult([]))   // DELETE verification_codes
      .mockResolvedValueOnce(pgResult([]))   // INSERT license

    const result = await completeRegistration('x@b.com', '123456')

    expect(result).toEqual({ success: true })
    expect(mockCreateSession).toHaveBeenCalledWith('new-u', 'x@b.com', 'user', 'free')
    // Verify license was provisioned
    const licenseCall = mockQuery.mock.calls[3]
    expect(licenseCall[0]).toMatch(/INSERT INTO licenses/)
  })

  it('returns error when db throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('insert failed'))
    const result = await completeRegistration('x@b.com', '123456')
    expect(result).toEqual({ error: 'Failed to finalize identity creation' })
  })
})

// ─── requestPasswordReset ─────────────────────────────────────────────────────

describe('requestPasswordReset()', () => {
  it('returns error when identity not found', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([], 0))
    const result = await requestPasswordReset('ghost@b.com')
    expect(result).toEqual({ error: 'Identity not found in node' })
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('inserts reset code and sends email on success', async () => {
    mockQuery
      .mockResolvedValueOnce(pgResult([{ id: 'u1' }], 1))   // check user exists
      .mockResolvedValueOnce(pgResult([]))                     // INSERT verification_codes
    const result = await requestPasswordReset('user@b.com')
    expect(result).toEqual({ success: true })
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('user@b.com', expect.stringMatching(/^\d{6}$/))
  })

  it('uses fixed code "123456" for admin email', async () => {
    process.env.SMTP_USER = 'admin@catest.ai'
    mockQuery
      .mockResolvedValueOnce(pgResult([{ id: 'u1' }], 1))
      .mockResolvedValueOnce(pgResult([]))

    await requestPasswordReset('admin@catest.ai')
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('admin@catest.ai', '123456')
    delete process.env.SMTP_USER
  })

  it('returns error when db throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('network error'))
    const result = await requestPasswordReset('user@b.com')
    expect(result).toEqual({ error: 'Failed to dispatch recovery code' })
  })
})

// ─── resetPassword ────────────────────────────────────────────────────────────

describe('resetPassword()', () => {
  it('returns error when recovery session not found', async () => {
    mockQuery.mockResolvedValueOnce(pgResult([], 0))
    const result = await resetPassword('x@b.com', '123456', 'newpass')
    expect(result).toEqual({ error: 'Recovery session expired' })
  })

  it('returns error when reset code is expired', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    mockQuery
      .mockResolvedValueOnce(pgResult([{ code: '123456', expires_at: pastDate }]))
      .mockResolvedValueOnce(pgResult([]))   // DELETE
    const result = await resetPassword('x@b.com', '123456', 'newpass')
    expect(result).toEqual({ error: 'Recovery code expired' })
  })

  it('returns error when code does not match', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    mockQuery.mockResolvedValueOnce(pgResult([{ code: '999999', expires_at: futureDate }]))
    const result = await resetPassword('x@b.com', '000000', 'newpass')
    expect(result).toEqual({ error: 'Invalid security code' })
  })

  it('updates password hash and deletes reset code on success', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    mockBcryptHash.mockResolvedValueOnce('$2a$10$newHash')
    mockQuery
      .mockResolvedValueOnce(pgResult([{ code: '123456', expires_at: futureDate }]))
      .mockResolvedValueOnce(pgResult([]))   // UPDATE password_hash
      .mockResolvedValueOnce(pgResult([]))   // DELETE verification_codes

    const result = await resetPassword('x@b.com', '123456', 'newpass')

    expect(result).toEqual({ success: true })
    expect(mockBcryptHash).toHaveBeenCalledWith('newpass', 10)
    // Verify UPDATE was called with the new hash
    const updateCall = mockQuery.mock.calls[1]
    expect(updateCall[0]).toMatch(/UPDATE users SET password_hash/)
    expect(updateCall[1][0]).toBe('$2a$10$newHash')
  })

  it('returns error when db throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('disk full'))
    const result = await resetPassword('x@b.com', '123456', 'newpass')
    expect(result).toEqual({ error: 'Failed to update security credentials' })
  })
})

// ─── logout ───────────────────────────────────────────────────────────────────

describe('logout()', () => {
  it('calls invalidateSession when sessionId is available', async () => {
    mockGetSession.mockResolvedValueOnce({ sessionId: 'sess-abc' })
    await logout()
    expect(mockInvalidateSession).toHaveBeenCalledWith('sess-abc')
  })

  it('falls back to deleting cookie when session has no sessionId', async () => {
    mockGetSession.mockResolvedValueOnce(null)

    // Mock next/headers dynamic import
    const mockDeleteCookie = vi.fn()
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ delete: mockDeleteCookie }),
    }))

    await logout()
    // invalidateSession should NOT be called
    expect(mockInvalidateSession).not.toHaveBeenCalled()
  })
})

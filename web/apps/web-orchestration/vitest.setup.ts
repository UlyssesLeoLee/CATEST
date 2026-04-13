import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Provide a global fetch mock so tests can control network responses
global.fetch = vi.fn()

// Suppress Next.js "use client" warnings in test output
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : ''
  if (
    msg.includes('Warning: ReactDOM.render') ||
    msg.includes('act(') ||
    msg.includes('Not implemented: navigation')
  ) {
    return
  }
  originalConsoleError(...args)
}

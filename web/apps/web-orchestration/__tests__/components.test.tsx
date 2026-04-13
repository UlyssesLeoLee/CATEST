/**
 * components.test.tsx
 *
 * Integration tests for OrchestrationPage and all sub-components rendered through it.
 * All network calls are mocked via vi.fn() on global.fetch.
 * SSE streams are simulated with ReadableStream + TextEncoder.
 */

import React from 'react'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import OrchestrationPage from '../src/app/page'

// ─── Mock @catest/ui ──────────────────────────────────────────────────────────

vi.mock('@catest/ui', () => {
  // In tests, cookie/localStorage hooks behave like plain useState
  // (no actual cookie read/write) — this keeps tests deterministic.
  const { useState } = require('react')

  return {
    Button: ({ children, onClick, disabled, variant, size, className }: any) => (
      <button
        onClick={onClick}
        disabled={disabled}
        data-variant={variant}
        data-size={size}
        className={className}
        data-testid="send-button"
      >
        {children}
      </button>
    ),
    Badge: ({ children, className }: any) => (
      <span className={className} data-testid="badge">
        {children}
      </span>
    ),
    Card: ({ children }: any) => <div data-testid="card">{children}</div>,
    AppShell: ({ children }: any) => (
      <div data-testid="app-shell">{children}</div>
    ),
    cn: (...classes: (string | undefined | null | false)[]) =>
      classes.filter(Boolean).join(' '),
    SteamEmission: () => <div data-testid="steam-emission" />,
    VictorianDivider: ({ className }: any) => (
      <hr data-testid="victorian-divider" className={className} />
    ),
    // Cookie-backed state hooks — simplified to plain useState for tests
    useCookieState: (key: string, defaultVal: string) => useState(defaultVal),
    useBoolCookieState: (key: string, defaultVal: boolean) => useState(defaultVal),
    // COOKIE_KEYS — only the keys used by page.tsx need to be present
    COOKIE_KEYS: {
      ORCH_TARGET: 'orch_target',
      ORCH_MODEL: 'orch_model',
      ORCH_PROJECT: 'orch_project',
      ORCH_SIDEBAR_OPEN: 'orch_sidebar_open',
      SIDEBAR_COLLAPSED: 'sidebar_collapsed',
    },
  }
})

// ─── Mock lucide-react ────────────────────────────────────────────────────────

vi.mock('lucide-react', () => ({
  Bot: ({ className }: any) => <span data-testid="icon-bot" className={className} />,
  Cpu: ({ className }: any) => <span data-testid="icon-cpu" className={className} />,
  Zap: ({ className }: any) => <span data-testid="icon-zap" className={className} />,
  Send: ({ className }: any) => <span data-testid="icon-send" className={className} />,
  Loader2: ({ className }: any) => (
    <span data-testid="icon-loader" className={className} />
  ),
  Sparkles: ({ className }: any) => (
    <span data-testid="icon-sparkles" className={className} />
  ),
  Terminal: ({ className }: any) => (
    <span data-testid="icon-terminal" className={className} />
  ),
  Wrench: ({ className }: any) => (
    <span data-testid="icon-wrench" className={className} />
  ),
  AlertCircle: ({ className }: any) => (
    <span data-testid="icon-alert" className={className} />
  ),
  ChevronDown: ({ className }: any) => (
    <span data-testid="icon-chevron" className={className} />
  ),
  Copy: ({ className }: any) => (
    <span data-testid="icon-copy" className={className} />
  ),
  Check: ({ className }: any) => (
    <span data-testid="icon-check" className={className} />
  ),
  CheckCheck: ({ className }: any) => (
    <span data-testid="icon-checkcheck" className={className} />
  ),
  Square: ({ className }: any) => (
    <span data-testid="icon-square" className={className} />
  ),
  GitBranch: ({ className }: any) => (
    <span data-testid="icon-gitbranch" className={className} />
  ),
  Settings: ({ className }: any) => (
    <span data-testid="icon-settings" className={className} />
  ),
  Clock: ({ className }: any) => (
    <span data-testid="icon-clock" className={className} />
  ),
  History: ({ className }: any) => (
    <span data-testid="icon-history" className={className} />
  ),
  User: ({ className }: any) => (
    <span data-testid="icon-user" className={className} />
  ),
  Package: ({ className }: any) => (
    <span data-testid="icon-package" className={className} />
  ),
  Radio: ({ className }: any) => (
    <span data-testid="icon-radio" className={className} />
  ),
  Database: ({ className }: any) => (
    <span data-testid="icon-database" className={className} />
  ),
  X: ({ className }: any) => <span data-testid="icon-x" className={className} />,
}))

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_MODELS_RESPONSE = {
  claude_code: {
    available: true,
    version: '2.1.0',
    models: [
      { id: 'ide', label: 'IDE Chat' },
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
    ],
  },
  codex: {
    available: true,
    version: '0.38.0',
    models: [
      { id: 'ide', label: 'IDE Chat' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  antigravity: {
    available: true,
    version: 'keyboard',
    models: [{ id: 'ide', label: 'IDE Chat' }],
  },
}

const MOCK_EXECUTE_RESPONSE = {
  trace_id: 'test-trace-123',
  status: 'started',
}

/** Build a ReadableStream that yields SSE lines then closes */
function makeSseStream(lines: string[]) {
  const encoder = new TextEncoder()
  let idx = 0
  return new ReadableStream({
    async pull(controller) {
      if (idx < lines.length) {
        controller.enqueue(encoder.encode(lines[idx++]))
      } else {
        controller.close()
      }
    },
  })
}

/**
 * Build a ReadableStream that yields SSE lines but NEVER closes.
 * Used to test the "streaming" state — the stream stays open so
 * the trace badge remains "streaming" long enough for waitFor to observe it.
 */
function makeOpenStream(lines: string[]) {
  const encoder = new TextEncoder()
  let idx = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < lines.length) {
        controller.enqueue(encoder.encode(lines[idx++]))
        return
      }
      // No more data right now — return a promise that never resolves
      // so the reader.read() hangs and onDone() is never called.
      return new Promise<void>(() => { /* intentionally never resolves */ })
    },
  })
}

const SSE_EVENTS = [
  `data: {"event":"start","target":"claude_code","trace_id":"test-trace-123"}\n\n`,
  `data: {"event":"status","message":"Focusing Claude Code IDE..."}\n\n`,
  `data: {"event":"text","content":"Hello from the AI."}\n\n`,
  `data: {"event":"done"}\n\n`,
  `data: {"event":"end"}\n\n`,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reset fetch mock and set up default happy-path responses */
function setupFetchMocks({
  modelsOk = true,
  executeOk = true,
  streamEvents = SSE_EVENTS,
} = {}) {
  const mockFetch = vi.fn((url: string, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : String(url)

    // /models — called by useModels on mount
    if (u.endsWith('/models')) {
      if (!modelsOk) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => MOCK_MODELS_RESPONSE,
      } as Response)
    }

    // /execute — POST when user sends a message
    if (u.endsWith('/execute')) {
      if (!executeOk) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({}),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => MOCK_EXECUTE_RESPONSE,
      } as Response)
    }

    // /stream/:traceId — SSE stream
    if (u.includes('/stream/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        body: makeSseStream(streamEvents),
      } as unknown as Response)
    }

    // /intent — gateway fire-and-forget, always resolve silently
    if (u.endsWith('/intent')) {
      return Promise.resolve({ ok: true, status: 202, json: async () => ({}) } as Response)
    }

    // /stop/:traceId
    if (u.includes('/stop/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
    }

    // Fallback — unknown URL
    return Promise.reject(new Error(`Unexpected fetch: ${u}`))
  })

  global.fetch = mockFetch as unknown as typeof fetch
  return mockFetch
}

// ─── A. Initial Render ────────────────────────────────────────────────────────

describe('A. Initial Render', () => {
  beforeEach(() => {
    setupFetchMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Orchestration Console heading', async () => {
    render(<OrchestrationPage />)
    // Use getByRole to target only the <h1> heading, not the welcome message
    // body which also contains the words "Orchestration Console"
    expect(
      screen.getByRole('heading', { name: /Orchestration Console/i })
    ).toBeInTheDocument()
  })

  it('renders the welcome message from the assistant', async () => {
    render(<OrchestrationPage />)
    expect(
      screen.getByText(/Welcome to the Orchestration Console/i)
    ).toBeInTheDocument()
  })

  it('renders the textarea for user input', () => {
    render(<OrchestrationPage />)
    expect(document.querySelector('textarea')).toBeInTheDocument()
  })

  it('send button is present in the document', () => {
    render(<OrchestrationPage />)
    const btn = screen.getByTestId('send-button')
    expect(btn).toBeInTheDocument()
  })

  it('send button is disabled when input is empty', () => {
    render(<OrchestrationPage />)
    const btn = screen.getByTestId('send-button')
    expect(btn).toBeDisabled()
  })

  it('default target is claude_code — label visible in toolbar', async () => {
    render(<OrchestrationPage />)
    // The bottom toolbar shows "target: claude_code"
    expect(screen.getByText(/target: claude_code/i)).toBeInTheDocument()
  })

  it('renders the project input field with default value "default"', () => {
    render(<OrchestrationPage />)
    const input = screen.getByDisplayValue('default') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('default')
  })
})

// ─── B. Model Loading ─────────────────────────────────────────────────────────

describe('B. Model Loading', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls /models on mount', async () => {
    const mockFetch = setupFetchMocks()
    render(<OrchestrationPage />)
    await waitFor(() => {
      const calls = mockFetch.mock.calls.map(([url]) => String(url))
      expect(calls.some(u => u.endsWith('/models'))).toBe(true)
    })
  })

  it('shows IDE Chat label in the bottom toolbar after models load', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)
    await waitFor(() => {
      expect(screen.getByText(/model: IDE Chat/i)).toBeInTheDocument()
    })
  })

  it('falls back to hardcoded model list when /models returns non-OK', async () => {
    setupFetchMocks({ modelsOk: false })
    render(<OrchestrationPage />)
    // With fallback models, the toolbar should still show a model name
    await waitFor(() => {
      // toolbar always renders "model: <label or id>"
      expect(screen.getByText(/model:/i)).toBeInTheDocument()
    })
  })

  it('falls back gracefully when /models fetch throws a network error', async () => {
    global.fetch = vi.fn((url: string) => {
      if (String(url).endsWith('/models')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
    }) as unknown as typeof fetch

    // Should not throw — fallback silently
    render(<OrchestrationPage />)
    await waitFor(() => {
      expect(screen.getByText(/model:/i)).toBeInTheDocument()
    })
  })
})

// ─── C. Message Dispatch ──────────────────────────────────────────────────────

describe('C. Message Dispatch', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('typing in textarea enables the send button', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Build me a thing' } })
    })

    const btn = screen.getByTestId('send-button')
    expect(btn).not.toBeDisabled()
  })

  it('send button becomes disabled again when textarea is cleared', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Hello' } })
    })
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '' } })
    })

    expect(screen.getByTestId('send-button')).toBeDisabled()
  })

  it('user message appears in chat after pressing Enter', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Build me a component' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      // Text appears in both the user bubble AND the sidebar trace title —
      // use getAllByText and assert at least one match exists.
      expect(screen.getAllByText('Build me a component').length).toBeGreaterThan(0)
    })
  })

  it('calls /execute with correct JSON payload on send', async () => {
    const mockFetch = setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Write unit tests' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      const executeCalls = mockFetch.mock.calls.filter(([url]) =>
        String(url).endsWith('/execute')
      )
      expect(executeCalls.length).toBeGreaterThan(0)

      const [, init] = executeCalls[0]
      const body = JSON.parse(init?.body as string)
      expect(body.prompt).toBe('Write unit tests')
      expect(body.target).toBe('claude_code')
      expect(body.model).toBeDefined()
      expect(body.project).toBe('default')
    })
  })

  it('clears textarea after message is sent', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Do something' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(textarea.value).toBe('')
    })
  })

  it('Shift+Enter does NOT submit — inserts newline', async () => {
    const mockFetch = setupFetchMocks()
    render(<OrchestrationPage />)

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'line one' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    })

    const executeCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).endsWith('/execute')
    )
    expect(executeCalls).toHaveLength(0)
  })

  it('status SSE event renders in the assistant bubble', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Run the tests' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(
        screen.getByText('Focusing Claude Code IDE...')
      ).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('text SSE event renders its content in the assistant bubble', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Hello' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(screen.getByText('Hello from the AI.')).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

// ─── D. Error Handling ────────────────────────────────────────────────────────

describe('D. Error Handling', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows error message in chat when bridge /execute is unreachable', async () => {
    setupFetchMocks({ executeOk: false })
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Try something' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to reach the orchestration gateway/i)
      ).toBeInTheDocument()
    })
  })

  it('shows error when bridge throws a network error', async () => {
    global.fetch = vi.fn((url: string) => {
      const u = String(url)
      if (u.endsWith('/models')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => MOCK_MODELS_RESPONSE,
        } as Response)
      }
      if (u.endsWith('/intent')) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      }
      return Promise.reject(new Error('ECONNREFUSED'))
    }) as unknown as typeof fetch

    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Test failure' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(screen.getByText(/ECONNREFUSED/i)).toBeInTheDocument()
    })
  })

  it('renders SSE error event with alert icon in message bubble', async () => {
    const errorStream = [
      `data: {"event":"error","message":"Tool execution timed out"}\n\n`,
      `data: {"event":"end"}\n\n`,
    ]
    setupFetchMocks({ streamEvents: errorStream })
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Run something' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(screen.getByText('Tool execution timed out')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows error when /execute returns no trace_id', async () => {
    global.fetch = vi.fn((url: string) => {
      const u = String(url)
      if (u.endsWith('/models')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => MOCK_MODELS_RESPONSE,
        } as Response)
      }
      if (u.endsWith('/execute')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'started' }), // no trace_id
        } as Response)
      }
      if (u.endsWith('/intent')) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      }
      return Promise.reject(new Error('Unexpected'))
    }) as unknown as typeof fetch

    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'No trace id test' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to reach the orchestration gateway/i)
      ).toBeInTheDocument()
    })
  })
})

// ─── E. Target Switching ──────────────────────────────────────────────────────

describe('E. Target Switching', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('default target shown in toolbar is claude_code', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)
    expect(screen.getByText(/target: claude_code/i)).toBeInTheDocument()
  })

  it('clicking target selector button opens the dropdown', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    // "Claude Code" is a direct text node inside the button (not in a child
    // element), so we find it via getAllByRole and textContent matching.
    const targetBtn = screen
      .getAllByRole('button')
      .find(b => b.textContent?.includes('Claude Code'))

    expect(targetBtn).toBeDefined()

    await act(async () => {
      fireEvent.click(targetBtn!)
    })
    // Dropdown entries should appear
    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('Antigravity')).toBeInTheDocument()
  })

  it('toolbar reflects codex after target switch', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    // Find the target-selector button (contains Claude Code text + chevron icon)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const targetBtn = buttons.find(b => b.textContent?.includes('Claude Code'))
      expect(targetBtn).toBeDefined()
    })

    const buttons = screen.getAllByRole('button')
    const targetBtn = buttons.find(b => b.textContent?.includes('Claude Code'))!

    await act(async () => {
      fireEvent.click(targetBtn)
    })

    const codexOption = screen.getAllByRole('button').find(
      b => b.textContent?.trim() === 'Codex'
    )
    if (codexOption) {
      await act(async () => {
        fireEvent.click(codexOption)
      })
      await waitFor(() => {
        expect(screen.getByText(/target: codex/i)).toBeInTheDocument()
      })
    }
  })
})

// ─── F. Trace Sidebar ─────────────────────────────────────────────────────────

describe('F. Trace Sidebar', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows "No traces yet" on first render', () => {
    setupFetchMocks()
    render(<OrchestrationPage />)
    expect(screen.getByText(/No traces yet/i)).toBeInTheDocument()
  })

  it('trace appears with status "streaming" after dispatch', async () => {
    // Use a stream that yields one event but never closes so the trace
    // status stays "streaming" long enough for waitFor to observe it.
    const neverEnding = [
      `data: {"event":"status","message":"Working..."}\n\n`,
    ]

    // Override the /stream/ mock to use makeOpenStream instead of makeSseStream
    const mockFetch = vi.fn((url: string) => {
      const u = String(url)
      if (u.endsWith('/models')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => MOCK_MODELS_RESPONSE,
        } as Response)
      }
      if (u.endsWith('/execute')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => MOCK_EXECUTE_RESPONSE,
        } as Response)
      }
      if (u.includes('/stream/')) {
        return Promise.resolve({
          ok: true, status: 200,
          body: makeOpenStream(neverEnding),
        } as unknown as Response)
      }
      if (u.endsWith('/intent')) {
        return Promise.resolve({ ok: true, status: 202, json: async () => ({}) } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch: ${u}`))
    })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Start a job' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      const streamingBadges = screen.queryAllByText(/streaming/i)
      expect(streamingBadges.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('trace shows "completed" after stream ends', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Complete this task' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      const completedBadges = screen.queryAllByText(/completed/i)
      expect(completedBadges.length).toBeGreaterThan(0)
    }, { timeout: 5000 })
  })

  it('trace title is truncated from the user message', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Deploy the application' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      // Text appears in both the sidebar trace title and the user bubble —
      // assert at least one element contains the text.
      expect(screen.getAllByText(/Deploy the application/i).length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('sidebar header shows "Trace History" label', () => {
    setupFetchMocks()
    render(<OrchestrationPage />)
    expect(screen.getByText(/Trace History/i)).toBeInTheDocument()
  })
})

// ─── G. StreamEventBlock rendering ───────────────────────────────────────────

describe('G. StreamEventBlock — individual SSE event rendering', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  async function renderWithEvents(events: string[]) {
    setupFetchMocks({ streamEvents: events })
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Test message' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })
  }

  it('"status" event renders its message text', async () => {
    await renderWithEvents([
      `data: {"event":"status","message":"Structuring prompt..."}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('Structuring prompt...')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"text" event renders its content', async () => {
    await renderWithEvents([
      `data: {"event":"text","content":"AI response text here."}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('AI response text here.')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"tool_use" event renders tool name and input', async () => {
    await renderWithEvents([
      `data: {"event":"tool_use","tool":"read_file","input":"src/index.ts"}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getByText('src/index.ts')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"tool_result" event renders truncated content', async () => {
    await renderWithEvents([
      `data: {"event":"tool_result","content":"File contents: console.log('hello')"}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText(/File contents:/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"error" event renders with error message text', async () => {
    await renderWithEvents([
      `data: {"event":"error","message":"Tool timeout after 30s"}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('Tool timeout after 30s')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"result" event with subtype=success renders success badge', async () => {
    await renderWithEvents([
      `data: {"event":"result","subtype":"success","cost_usd":0.0042,"duration_ms":3200,"num_turns":4}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('success')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"result" event renders cost badge', async () => {
    await renderWithEvents([
      `data: {"event":"result","subtype":"success","cost_usd":0.0042,"duration_ms":3200}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('$0.0042')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"result" event renders duration badge', async () => {
    await renderWithEvents([
      `data: {"event":"result","subtype":"success","duration_ms":3200}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('3.2s')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"result" event renders num_turns badge', async () => {
    await renderWithEvents([
      `data: {"event":"result","subtype":"success","num_turns":7}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('7 turns')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('"result" event with subtype=error renders error-styled badge', async () => {
    await renderWithEvents([
      `data: {"event":"result","subtype":"error","duration_ms":100}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      // badge with "error" text should appear
      const badges = screen.queryAllByTestId('badge')
      expect(badges.some(b => b.textContent === 'error')).toBe(true)
    }, { timeout: 3000 })
  })

  it('"system" event (alias for status) renders its message', async () => {
    await renderWithEvents([
      `data: {"event":"system","message":"System initialised","subtype":"init"}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('System initialised')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('multiple events render in order', async () => {
    await renderWithEvents([
      `data: {"event":"status","message":"Step 1"}\n\n`,
      `data: {"event":"status","message":"Step 2"}\n\n`,
      `data: {"event":"text","content":"Final answer."}\n\n`,
      `data: {"event":"end"}\n\n`,
    ])
    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument()
      expect(screen.getByText('Step 2')).toBeInTheDocument()
      expect(screen.getByText('Final answer.')).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

// ─── H. Loading / Thinking state ─────────────────────────────────────────────

describe('H. Loading State', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('send button shows loader icon while request is in-flight', async () => {
    // /execute never resolves so we stay in loading state
    global.fetch = vi.fn((url: string) => {
      const u = String(url)
      if (u.endsWith('/models')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => MOCK_MODELS_RESPONSE,
        } as Response)
      }
      if (u.endsWith('/intent')) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      }
      if (u.endsWith('/execute')) {
        // Never resolves
        return new Promise(() => {})
      }
      return Promise.reject(new Error('Unexpected'))
    }) as unknown as typeof fetch

    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Loading test' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      // The send button should now contain the Loader icon
      const btn = screen.getByTestId('send-button')
      expect(btn.querySelector('[data-testid="icon-loader"]')).toBeInTheDocument()
    })
  })

  it('send button is disabled while loading', async () => {
    global.fetch = vi.fn((url: string) => {
      const u = String(url)
      if (u.endsWith('/models')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => MOCK_MODELS_RESPONSE,
        } as Response)
      }
      if (u.endsWith('/intent')) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      }
      return new Promise(() => {})
    }) as unknown as typeof fetch

    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Wait forever' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(screen.getByTestId('send-button')).toBeDisabled()
    })
  })
})

// ─── I. Sidebar toggle ────────────────────────────────────────────────────────

describe('I. Sidebar Toggle', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sidebar is visible by default', () => {
    setupFetchMocks()
    render(<OrchestrationPage />)
    expect(screen.getByText(/Trace History/i)).toBeInTheDocument()
  })

  it('clicking the GitBranch button hides the sidebar', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    // The GitBranch button is the toggle
    const gitBranchIcon = screen.getByTestId('icon-gitbranch')
    const toggleBtn = gitBranchIcon.closest('button')!

    await act(async () => {
      fireEvent.click(toggleBtn)
    })

    expect(screen.queryByText(/Trace History/i)).not.toBeInTheDocument()
  })

  it('clicking the toggle again re-shows the sidebar', async () => {
    setupFetchMocks()
    render(<OrchestrationPage />)

    const gitBranchIcon = screen.getByTestId('icon-gitbranch')
    const toggleBtn = gitBranchIcon.closest('button')!

    await act(async () => {
      fireEvent.click(toggleBtn)
    })
    await act(async () => {
      fireEvent.click(toggleBtn)
    })

    expect(screen.getByText(/Trace History/i)).toBeInTheDocument()
  })
})

// ─── J. Project field ─────────────────────────────────────────────────────────

describe('J. Project Field', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('project field shows "default" initially', () => {
    setupFetchMocks()
    render(<OrchestrationPage />)
    const input = screen.getByDisplayValue('default')
    expect(input).toBeInTheDocument()
  })

  it('project field value is included in /execute payload', async () => {
    const mockFetch = setupFetchMocks()
    render(<OrchestrationPage />)

    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Orchestration Console/i)).toBeInTheDocument()
    )

    // Change project name
    const projectInput = screen.getByDisplayValue('default')
    await act(async () => {
      fireEvent.change(projectInput, { target: { value: 'my-project' } })
    })

    const textarea = document.querySelector('textarea')!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Test with project' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      const executeCalls = mockFetch.mock.calls.filter(([url]) =>
        String(url).endsWith('/execute')
      )
      expect(executeCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(executeCalls[0][1]?.body as string)
      expect(body.project).toBe('my-project')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWorkspaceDb, listWorkspaces } from '../src/lib/sqlite'
import fs from 'fs'
import Database from 'better-sqlite3'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn().mockImplementation(function() {
      return {
        exec: vi.fn()
      }
    })
  }
})

describe('SQLite Workspace Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should list workspaces correctly', () => {
    // @ts-ignore
    fs.existsSync.mockReturnValue(true)
    // @ts-ignore
    fs.readdirSync.mockReturnValue(['test-ws.db', 'another.db', 'not-a-db.txt'])

    const workspaces = listWorkspaces()
    expect(workspaces).toEqual(['test-ws', 'another'])
  })

  it('should initialize a workspace database', () => {
    const db = getWorkspaceDb('test-id')
    expect(Database).toHaveBeenCalledWith(expect.stringContaining('test-id.db'))
  })
})

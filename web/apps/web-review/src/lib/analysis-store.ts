"use client";

/**
 * Module-level store for AI analysis findings.
 * Shared between ReviewEditorPluginGroup (producer) and
 * SuggestionsPluginGroup / AnalysisTab (consumer).
 *
 * Uses the useSyncExternalStore pattern — no Context Provider needed.
 */

export interface AnalysisFinding {
  lineId: number;
  severity: "info" | "warning" | "danger" | "error";
  category: string;
  message: string;
  suggestedFix?: string | null;
}

export interface TBViolation {
  lineId: number;
  sourceLine: string;
  term: string;
  suggestedTerm: string;
  forbidden: boolean;
  domain?: string | null;
}

interface StoreSnapshot {
  findings: AnalysisFinding[];
  tbViolations: TBViolation[];
  isAnalyzing: boolean;
  /** How many findings have streamed in so far (used for progress indicator) */
  streamingCount: number;
  /** Error message if last analysis failed */
  error: string | null;
}

let state: StoreSnapshot = {
  findings: [],
  tbViolations: [],
  isAnalyzing: false,
  streamingCount: 0,
  error: null,
};

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export const analysisStore = {
  // ── useSyncExternalStore interface ─────────────────────────────────
  getSnapshot: (): StoreSnapshot => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  // ── Mutations ───────────────────────────────────────────────────────

  /** Called when AI analysis starts */
  startAnalysis: () => {
    state = { ...state, findings: [], isAnalyzing: true, streamingCount: 0, error: null };
    notify();
  },

  /** Called for each streamed finding */
  appendFinding: (finding: AnalysisFinding) => {
    state = {
      ...state,
      findings: [...state.findings, finding],
      streamingCount: state.streamingCount + 1,
    };
    notify();
  },

  /** Called when streaming is complete */
  finishAnalysis: (error?: string) => {
    state = { ...state, isAnalyzing: false, error: error ?? null };
    notify();
  },

  /** Replace all findings at once (non-streaming path) */
  setFindings: (findings: AnalysisFinding[]) => {
    state = { ...state, findings, isAnalyzing: false, error: null };
    notify();
  },

  /** Update TB violation list (runs independently of AI analysis) */
  setTBViolations: (tbViolations: TBViolation[]) => {
    state = { ...state, tbViolations };
    notify();
  },

  /** Dismiss a single finding by lineId + message (user action) */
  dismissFinding: (lineId: number, message: string) => {
    state = {
      ...state,
      findings: state.findings.filter(
        (f) => !(f.lineId === lineId && f.message === message)
      ),
    };
    notify();
  },

  /** Clear everything */
  clear: () => {
    state = { findings: [], tbViolations: [], isAnalyzing: false, streamingCount: 0, error: null };
    notify();
  },
};

/**
 * Cookie-based short-term UI state persistence.
 *
 * Stores non-sensitive, ephemeral preferences (sidebar collapsed, dismissed
 * banners, etc.) with configurable TTL.  All keys are prefixed with `catest_`
 * to avoid collision.  Runs exclusively on the client — SSR-safe via guards.
 *
 * Expiry guidelines:
 *   - Layout prefs (sidebar collapsed): 30 days
 *   - Dismissed tips / banners:         7 days
 *   - Session-only flags:               0 (session cookie — browser close)
 */

const PREFIX = "catest_";

// ── Low-level helpers ────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof document !== "undefined";
}

/** Set a cookie with an optional maxAge in **days**.  0 = session cookie. */
export function setCookie(
  key: string,
  value: string,
  maxAgeDays: number = 30,
  path: string = "/"
): void {
  if (!isBrowser()) return;

  const name = PREFIX + key;
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}; SameSite=Lax`;

  if (maxAgeDays > 0) {
    cookie += `; max-age=${Math.round(maxAgeDays * 86400)}`;
  }
  // maxAgeDays === 0 → no max-age → session cookie

  document.cookie = cookie;
}

/** Read a cookie value.  Returns `null` when absent. */
export function getCookie(key: string): string | null {
  if (!isBrowser()) return null;

  const name = PREFIX + key;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(encodeURIComponent(name) + "="));

  if (!match) return null;
  return decodeURIComponent(match.split("=").slice(1).join("="));
}

/** Delete a cookie by setting max-age=0. */
export function deleteCookie(key: string, path: string = "/"): void {
  if (!isBrowser()) return;
  const name = PREFIX + key;
  document.cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0`;
}

// ── Typed convenience ────────────────────────────────────────────────

/** Read a boolean cookie.  Returns `defaultValue` when absent. */
export function getBoolCookie(key: string, defaultValue: boolean = false): boolean {
  const v = getCookie(key);
  if (v === null) return defaultValue;
  return v === "1" || v === "true";
}

/** Write a boolean cookie. */
export function setBoolCookie(
  key: string,
  value: boolean,
  maxAgeDays: number = 30
): void {
  setCookie(key, value ? "1" : "0", maxAgeDays);
}

/** Read a JSON cookie.  Returns `defaultValue` on miss / parse error. */
export function getJsonCookie<T>(key: string, defaultValue: T): T {
  const v = getCookie(key);
  if (v === null) return defaultValue;
  try {
    return JSON.parse(v) as T;
  } catch {
    return defaultValue;
  }
}

/** Write a JSON cookie. */
export function setJsonCookie<T>(
  key: string,
  value: T,
  maxAgeDays: number = 30
): void {
  setCookie(key, JSON.stringify(value), maxAgeDays);
}

// ── Well-known keys (centralised) ────────────────────────────────────

/**
 * Registry of known cookie keys with their default TTL.
 * Import these constants instead of raw strings.
 *
 * Name format: <scope>_<feature>
 */
export const COOKIE_KEYS = {
  /** Sidebar collapsed state — persists 30 days */
  SIDEBAR_COLLAPSED: "sidebar_collapsed",

  /** Dismissed the "welcome" banner — 7 days */
  DISMISS_WELCOME: "dismiss_welcome",

  /** Dismissed the keyboard-shortcuts tip — 7 days */
  DISMISS_KBD_TIP: "dismiss_kbd_tip",

  /** Dismissed the steampunk-theme intro tooltip — 7 days */
  DISMISS_THEME_TIP: "dismiss_theme_tip",

  /** Last active app tab (review, rag, etc.) — 30 days */
  LAST_ACTIVE_APP: "last_active_app",

  /** Review editor: last selected TM bank — 30 days */
  REVIEW_TM_BANK: "review_tm_bank",

  /** Review editor: last selected TB bank — 30 days */
  REVIEW_TB_BANK: "review_tb_bank",

  /** Review editor: last selected language code — 30 days */
  REVIEW_LANG: "review_lang",

  /** Sound enabled / disabled — 30 days */
  SOUND_ENABLED: "sound_enabled",
} as const;

/** Default TTL per key (days). */
export const COOKIE_TTL: Record<string, number> = {
  [COOKIE_KEYS.SIDEBAR_COLLAPSED]: 30,
  [COOKIE_KEYS.DISMISS_WELCOME]: 7,
  [COOKIE_KEYS.DISMISS_KBD_TIP]: 7,
  [COOKIE_KEYS.DISMISS_THEME_TIP]: 7,
  [COOKIE_KEYS.LAST_ACTIVE_APP]: 30,
  [COOKIE_KEYS.REVIEW_TM_BANK]: 30,
  [COOKIE_KEYS.REVIEW_TB_BANK]: 30,
  [COOKIE_KEYS.REVIEW_LANG]: 30,
  [COOKIE_KEYS.SOUND_ENABLED]: 30,
};

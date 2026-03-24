"use client";

import { useState, useCallback, useEffect } from "react";
import { getCookie, setCookie, getBoolCookie, setBoolCookie, COOKIE_TTL } from "../lib/cookies";

/**
 * React hook — persists a string state in a cookie.
 *
 * On mount, reads the cookie; on change, writes it.
 * SSR-safe: during SSR the state starts at `defaultValue` and hydrates
 * on the first client render (via useEffect).
 *
 * @param key        Cookie key (without `catest_` prefix — added automatically).
 * @param defaultVal Default value when cookie is absent.
 * @param ttlDays    Override TTL; falls back to COOKIE_TTL registry or 30d.
 */
export function useCookieState(
  key: string,
  defaultVal: string = "",
  ttlDays?: number
): [string, (v: string) => void] {
  const ttl = ttlDays ?? COOKIE_TTL[key] ?? 30;

  const [value, setRaw] = useState<string>(defaultVal);

  // Hydrate from cookie after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = getCookie(key);
    if (stored !== null) setRaw(stored);
  }, [key]);

  const setValue = useCallback(
    (v: string) => {
      setRaw(v);
      setCookie(key, v, ttl);
    },
    [key, ttl]
  );

  return [value, setValue];
}

/**
 * React hook — persists a boolean state in a cookie.
 *
 * Same SSR-safe hydration strategy as `useCookieState`.
 */
export function useBoolCookieState(
  key: string,
  defaultVal: boolean = false,
  ttlDays?: number
): [boolean, (v: boolean) => void] {
  const ttl = ttlDays ?? COOKIE_TTL[key] ?? 30;

  const [value, setRaw] = useState<boolean>(defaultVal);

  useEffect(() => {
    const stored = getBoolCookie(key, defaultVal);
    setRaw(stored);
  }, [key, defaultVal]);

  const setValue = useCallback(
    (v: boolean) => {
      setRaw(v);
      setBoolCookie(key, v, ttl);
    },
    [key, ttl]
  );

  return [value, setValue];
}

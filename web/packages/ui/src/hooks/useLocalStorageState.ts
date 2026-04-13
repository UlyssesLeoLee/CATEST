"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * SSR-safe React hook for localStorage-backed state, namespaced per user.
 *
 * Storage key format: `catest:{userId}:{namespace}:{key}`
 * Falls back to `catest:{namespace}:{key}` when userId is not provided.
 *
 * Starts at defaultVal on both server and first client render (SSR-safe),
 * then hydrates from localStorage in a useEffect.
 *
 * Catches localStorage errors silently (private mode, quota exceeded, etc.).
 *
 * @param namespace  App/feature namespace (e.g. "workspace", "review")
 * @param key        The specific key within the namespace
 * @param defaultVal Default value used before hydration and on error
 * @param userId     Optional user ID for isolation between accounts
 * @returns          [value, setValue, clearValue]
 */
export function useLocalStorageState<T>(
  namespace: string,
  key: string,
  defaultVal: T,
  userId?: string,
): [T, (v: T) => void, () => void] {
  const storageKey = userId
    ? `catest:${userId}:${namespace}:${key}`
    : `catest:${namespace}:${key}`;

  // Always start with defaultVal for SSR consistency
  const [value, setValueInner] = useState<T>(defaultVal);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        setValueInner(JSON.parse(raw) as T);
      }
    } catch {
      // Ignore parse errors or unavailable localStorage
    }
  }, [storageKey]);

  const setValue = useCallback(
    (v: T) => {
      setValueInner(v);
      try {
        localStorage.setItem(storageKey, JSON.stringify(v));
      } catch {
        // Ignore quota exceeded or other write errors
      }
    },
    [storageKey],
  );

  const clearValue = useCallback(() => {
    setValueInner(defaultVal);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore errors
    }
  }, [storageKey, defaultVal]);

  return [value, setValue, clearValue];
}

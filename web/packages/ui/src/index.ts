"use client";

// @catest/ui — atomic component library shared across all micro-frontend apps
// Export all reusable components here so apps just import from "@catest/ui"

// Core UI components
export { Button }        from "./components/Button";
export { Badge }         from "./components/Badge";
export { Card }          from "./components/Card";
export { Spinner }       from "./components/Spinner";
export { Avatar }        from "./components/Avatar";
export { AppShell }      from "./components/AppShell";
export { SearchInput }   from "./components/SearchInput";

// Steampunk visual effects
export { CursorEffect }  from "./components/CursorEffect";
export * from './components/SteamEmission';
export * from './components/SteampunkDecor';
export { ScrollValve } from "./components/ScrollValve";
export { SoundProvider, useSound } from "./components/SoundSystem";

// Theme plugin group — apps use this for consistent steampunk atmosphere
export { SteampunkThemePluginGroup } from "./plugins/SteampunkThemePluginGroup";

// Hooks
export { useCookieState, useBoolCookieState } from "./hooks/useCookieState";

// Utilities
export { cn }            from "./lib/utils";
export { getAppUrl, APP_URLS, isSaaSMode } from "./lib/navigation";
export { getCookie, setCookie, deleteCookie, getBoolCookie, setBoolCookie, getJsonCookie, setJsonCookie, COOKIE_KEYS, COOKIE_TTL } from "./lib/cookies";

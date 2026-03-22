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
export * from './components/SteamEmission';
export * from './components/SteampunkDecor';
export { SoundProvider, useSound } from "./components/SoundSystem";

// Theme plugin group — apps use this for consistent steampunk atmosphere
export { SteampunkThemePluginGroup } from "./plugins/SteampunkThemePluginGroup";

// Utilities
export { cn }            from "./lib/utils";
export { getAppUrl, APP_URLS, isSaaSMode } from "./lib/navigation";

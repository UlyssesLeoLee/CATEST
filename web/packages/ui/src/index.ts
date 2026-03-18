// @catest/ui — atomic component library shared across all micro-frontend apps
// Export all reusable components here so apps just import from "@catest/ui"

export { Button }        from "./components/Button";
export { Badge }         from "./components/Badge";
export { Card }          from "./components/Card";
export { Spinner }       from "./components/Spinner";
export { Avatar }        from "./components/Avatar";
export { AppShell }      from "./components/AppShell";
export { SearchInput }   from "./components/SearchInput";
export { cn }            from "./lib/utils";
export { getAppUrl, APP_URLS, isSaaSMode } from "./lib/navigation";


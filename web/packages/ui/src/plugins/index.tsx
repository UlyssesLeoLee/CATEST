/**
 * Plugin System Core
 * 
 * A PluginGroup is a container for one specific functional domain (e.g., "Editor", "Suggestions").
 * A Plugin is an atomic feature within that group.
 * 
 * This pattern ensures each piece of UI is independently replaceable and testable.
 */

export interface Plugin {
  id: string;
  name: string;
  component: React.ComponentType<unknown>;
}

export interface PluginGroup {
  id: string;
  name: string;
  plugins: Plugin[];
}

import React from "react";

/**
 * PluginGroupRenderer — renders all plugins within a group.
 * Each plugin is independent and receives the same shared context props.
 */
export function PluginGroupRenderer({
  group,
  props = {},
}: {
  group: PluginGroup;
  props?: Record<string, unknown>;
}) {
  return (
    <>
      {group?.plugins?.map((plugin) => {
        const Comp = plugin.component as React.ComponentType<Record<string, unknown>>;
        return <Comp key={plugin.id} {...props} />;
      })}
    </>
  );
}

/**
 * PluginRegistry — global registry to discover and register plugins at runtime.
 * Enables optional plugins to be added/removed without touching page code.
 */
const registry = new Map<string, PluginGroup>();

// Re-export the unified steampunk theme plugin group
export { SteampunkThemePluginGroup } from "./SteampunkThemePluginGroup";

export const PluginRegistry = {
  register(group: PluginGroup) {
    registry.set(group.id, group);
  },
  get(id: string): PluginGroup | undefined {
    return registry.get(id);
  },
  all(): PluginGroup[] {
    return Array.from(registry.values());
  },
};

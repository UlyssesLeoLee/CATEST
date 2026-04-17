# CATEST Project — Claude Instructions

These instructions are NON-NEGOTIABLE and override all defaults.

---

## 1. Infrastructure: Always Envoy, Never Nginx

Use **Envoy proxy** for all reverse-proxy, load-balancing, and ingress needs.
Never suggest or use nginx.

---

## 2. Web UI: Plugin → PluginGroup → App (MANDATORY)

All new UI features in any CATEST web app (`web-rag`, `web-review`, `web-tm`, etc.)
**MUST** follow the three-layer plugin architecture:

### The Pattern

```
Plugin (atomic component)
  └─► PluginGroup (domain container)
        └─► App page (consumer via PluginGroupRenderer)
```

### Layer 1 — Plugin

- A self-contained React component owning one UI responsibility
- Name: `<Feature>Plugin` (PascalCase + `Plugin` suffix)
- ID: `kebab-case` string
- No required props; manages its own state

```typescript
function MyFeaturePlugin() { /* self-contained React component */ }

// Registered as:
{ id: "my-feature", name: "My Feature", component: MyFeaturePlugin as React.ComponentType<unknown> }
```

### Layer 2 — PluginGroup

- Groups related plugins for one functional domain
- File location: `src/plugins/<DomainName>PluginGroup/index.tsx`
- Export name matches directory name exactly
- ID: `kebab-case`

```typescript
// src/plugins/MyDomainPluginGroup/index.tsx
import { type PluginGroup } from "@catest/ui/plugins";

export const MyDomainPluginGroup: PluginGroup = {
  id: "my-domain",
  name: "My Domain",
  plugins: [
    { id: "my-feature", name: "My Feature", component: MyFeaturePlugin as React.ComponentType<unknown> },
  ],
};
```

### Layer 3 — App Page

- Imports PluginGroups, never individual plugin components
- Renders via `PluginGroupRenderer`

```typescript
import { MyDomainPluginGroup } from "@/plugins/MyDomainPluginGroup";
import { PluginGroupRenderer }  from "@catest/ui/plugins";

// In JSX:
<PluginGroupRenderer group={MyDomainPluginGroup} />
```

### Rules

1. **Every new feature = a Plugin** — never add bare components directly to a page
2. **Every Plugin belongs to a PluginGroup** — new group if no suitable one exists
3. **Pages only import PluginGroups** — never individual plugin components
4. **Naming strictly enforced:**
   - Function: `<Feature>Plugin`
   - Directory: `<Domain>PluginGroup`
   - Export: `<Domain>PluginGroup`
   - IDs: `kebab-case`
5. **Do not bypass** this by writing monolithic components in `page.tsx` or `layout.tsx`

### Infrastructure Files

| File | Purpose |
|------|---------|
| `packages/ui/src/plugins/index.tsx` | `Plugin`, `PluginGroup` types, `PluginGroupRenderer`, `PluginRegistry` |
| `apps/web-rag/src/plugins/GraphExplorerPluginGroup/index.tsx` | Graph feature plugins |
| `apps/web-rag/src/plugins/KnowledgeSearchPluginGroup/index.tsx` | Search feature plugins |
| `packages/ui/src/plugins/SteampunkThemePluginGroup.tsx` | Global theme effects (AppShell level) |

---

## 3. Python AI Services: LangGraph for Multi-Step AI Flows

For any AI workflow with more than one step, use **LangGraph StateGraph**.
- Node functions: `async def <step>_node(state: dict) -> dict`, decorated `@traceable`
- Use `interrupt_before` for human-in-the-loop checkpoints
- LLM calls: use `get_llm_nim()` (auto-falls back to Claude if NIM not configured)
- Checkpointer: `MemorySaver` for dev, persistent store for production

---

## 4. Port Registry

| Service | Port |
|---------|------|
| Gateway (Rust) | 33080 |
| web-rag | 33088 |
| ai-vector-ops (Python) | 34085 |
| Qdrant | 36333 |
| Memgraph Bolt | 37687 |
| Redis | 36379 |
| Postgres | 34321 |

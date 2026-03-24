"use client";

import { ReviewEditorPluginGroup } from "@/plugins/ReviewEditorPluginGroup";
import { SuggestionsPluginGroup }  from "@/plugins/SuggestionsPluginGroup";
import { PluginGroupRenderer }      from "@catest/ui/plugins";
import { Card } from "@catest/ui";
import { FileCheck } from "lucide-react";

export default function ReviewPage() {
  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Main Content: Split Pane */}
      <div className="flex flex-1 p-4 gap-4 min-h-0">
        {/* Left pane: Editor */}
        <section className="flex-[2] flex flex-col gap-3 min-h-0 min-w-0">
          <Card variant="glass" className="min-h-0 flex-1 flex flex-col border-[#b87333]/20">
            <div className="px-4 py-2.5 border-b border-[#b87333]/20 bg-white/[0.02] flex items-center justify-between">
              <h2 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
                <FileCheck className="w-3 h-3" />
                Review
              </h2>
              <div className="flex gap-1">
                {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-[#b87333]/30" />)}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <PluginGroupRenderer group={ReviewEditorPluginGroup} />
            </div>
          </Card>
        </section>

        {/* Right pane: Tabbed Panel (AI | TM | TB | QA) */}
        <aside className="flex-1 shrink-0 flex flex-col min-h-0 min-w-[220px] max-w-[22rem]">
          <Card variant="glass" className="min-h-0 flex-1 flex flex-col border-[#b87333]/20 overflow-hidden">
            <PluginGroupRenderer group={SuggestionsPluginGroup} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

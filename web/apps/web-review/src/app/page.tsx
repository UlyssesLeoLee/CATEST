"use client";

import { ReviewEditorPluginGroup } from "@/plugins/ReviewEditorPluginGroup";
import { SuggestionsPluginGroup }  from "@/plugins/SuggestionsPluginGroup";
import { PluginGroupRenderer }      from "@catest/ui/plugins";
import { Card, Badge, Button, getAppUrl } from "@catest/ui";
import {
  FileCheck,
  Sparkles,
  History,
  Share2,
  ChevronRight,
  ShieldCheck
} from "lucide-react";

export default function ReviewPage() {
  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Main Content: Split Pane — consistent golden ratio */}
      <div className="flex flex-1 p-6 gap-6 min-h-0">
        {/* Left pane: Editor */}
        <section className="flex-[var(--phi)] flex flex-col gap-4 min-h-0">
          <Card variant="glass" className="min-h-0 flex-1 flex flex-col border-[#b87333]/20">
            <div className="px-6 py-4 border-b border-[#b87333]/20 bg-white/[0.02] flex items-center justify-between">
              <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5" />
                Review Content
              </h2>
              <div className="flex gap-1.5">
                {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-[#b87333]/30" />)}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <PluginGroupRenderer group={ReviewEditorPluginGroup} />
            </div>
          </Card>
        </section>

        {/* Right pane: AI Suggestions */}
        <aside className="flex-1 shrink-0 flex flex-col gap-4 min-h-0 max-w-[24rem]">
          <Card variant="glass" className="min-h-0 flex-1 flex flex-col border-[var(--verdigris)]/20 bg-[var(--verdigris)]/[0.02]">
            <div className="px-6 py-4 border-b border-[var(--verdigris)]/10 bg-[var(--verdigris)]/5 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[var(--verdigris)] uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                AI Analysis
              </h2>
              <Badge className="bg-[var(--verdigris)] text-[var(--text-primary)] border-none text-[9px] px-1.5 py-0">LIVE</Badge>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <PluginGroupRenderer group={SuggestionsPluginGroup} />
            </div>
            <div className="p-4 border-t border-[var(--verdigris)]/10 bg-[var(--verdigris)]/5">
              <p className="text-[10px] text-[var(--verdigris)]/60 font-medium italic text-center">
                Refining suggestions based on your recent activity...
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

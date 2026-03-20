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
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Content Area starts directly, Navigation is handled by AppShell */}

      {/* Main Content: Split Pane */}
      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Left pane: Editor (Main focus) */}
        <section className="flex-1 flex flex-col gap-4 overflow-hidden">
          <Card variant="glass" className="flex-1 overflow-hidden flex flex-col border-[#b87333]/20">
            <div className="px-6 py-4 border-b border-[#b87333]/20 bg-white/[0.02] flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#c4b49a] uppercase tracking-widest flex items-center gap-2">
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

        {/* Right pane: AI Suggestions (Copilot style) */}
        <aside className="w-96 shrink-0 flex flex-col gap-4 overflow-hidden">
          <Card variant="glass" className="flex-1 flex flex-col border-[#c9a84c]/20 bg-[#c9a84c]/[0.02]">
            <div className="px-6 py-4 border-b border-[#c9a84c]/10 bg-[#c9a84c]/5 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#c9a84c] uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                AI Analysis
              </h2>
              <Badge className="bg-[#c9a84c] text-[#f5e6d0] border-none text-[9px] px-1.5 py-0">LIVE</Badge>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <PluginGroupRenderer group={SuggestionsPluginGroup} />
            </div>
            <div className="p-4 border-t border-[#c9a84c]/10 bg-[#c9a84c]/5">
              <p className="text-[10px] text-[#c9a84c]/60 font-medium italic text-center">
                Refining suggestions based on your recent activity...
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}


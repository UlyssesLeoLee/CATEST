"use server";

import { reviewGraph } from "@/lib/agents/review-graph";

export interface AgentReviewInput {
  query: string;
  segmentSource?: string;
  segmentTarget?: string;
}

export async function runAgentReview(input: AgentReviewInput) {
  console.log("Starting LangGraph Agentic Review...");
  
  try {
    const initialState = {
      query: input.query,
      segmentContext: 
        input.segmentSource && input.segmentTarget
          ? { source: input.segmentSource, target: input.segmentTarget }
          : null,
      intents: [],
      evidence: {},
      finalResponse: "",
    };

    // Invoke the compiled graph
    const finalState = await reviewGraph.invoke(initialState, {
      configurable: { thread_id: "agentic-review-1" },
    });

    return {
      success: true,
      data: {
        intentsClassified: finalState.intents,
        evidenceGathered: finalState.evidence,
        agentResponse: finalState.finalResponse,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error in agent execution";
    console.error("Agent failed:", err);
    return { success: false, error: msg };
  }
}

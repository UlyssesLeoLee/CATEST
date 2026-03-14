import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";


// --- 1. Define the State ---
export const GraphState = Annotation.Root({
  // The raw input from the user or CAT interface
  query: Annotation<string>(),
  // The selected CAT segment (source and target text) if any
  segmentContext: Annotation<{ source: string; target: string } | null>(),
  // Intent classification result
  intents: Annotation<string[]>({
    reducer: (curr, next) => next,
    default: () => [],
  }),
  // Evidence collected from various RAG modules
  evidence: Annotation<Record<string, unknown[]>>({
    reducer: (curr, next) => ({ ...curr, ...next }),
    default: () => ({}),
  }),

  // The final LLM response/review
  finalResponse: Annotation<string>(),
});

// --- 2. Initialize LLM (Points to Local Ollama/Qwen by default) ---
const llm = new ChatOpenAI({
  modelName: process.env.OLLAMA_MODEL || "qwen2.5:7b",
  temperature: 0,
  openAIApiKey: "ollama", // Dummy key for local
  configuration: {
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  },
});

// --- 3. Define Nodes ---

// Node A: Intent Routing
async function routeIntent(state: typeof GraphState.State) {
  console.log("--- ROUTING INTENT ---");
  const { query, segmentContext } = state;

  const prompt = `You are a router for a Computer-Aided Translation (CAT) and Code Review platform.
Analyze the user's query and the current segment context to determine WHICH retrieval modules are needed.
Respond ONLY with a JSON array of strings from this list: ["TERM", "MEMORY", "RULE", "GRAPH", "DOC"].
Example: ["TERM", "RULE"]

Query: ${query}
Segment Context: ${segmentContext ? `Source: ${segmentContext.source}\nTarget: ${segmentContext.target}` : "None"}`;

  const response = await llm.invoke([new SystemMessage(prompt)]);
  
  try {
    const content = response.content as string;
    const jsonStr = content.substring(content.indexOf("["), content.lastIndexOf("]") + 1);
    const parsed = JSON.parse(jsonStr) as string[];
    return { intents: parsed };
  } catch (e) {
    console.error("Failed to parse intents, defaulting to general query", e);
    return { intents: ["DOC"] }; 
  }
}

// Node B: Termbase Retrieval
async function retrieveTerms() {
  console.log("--- RETRIEVING TERMS ---");
  try {
    const res = await fetch("http://localhost:33080/api/rag/terms");
    if (res.ok) {
      const data = await res.json();
      return { evidence: { terms: data.data || [] } };
    }
  } catch (err) {
    console.error("Failed to fetch terms", err);
  }
  return { evidence: { terms: [] } };
}

// Node C: Rulebase Retrieval
async function retrieveRules() {
  console.log("--- RETRIEVING RULES ---");
  try {
    const res = await fetch("http://localhost:33080/api/rag/rules");
    if (res.ok) {
      const data = await res.json();
      return { evidence: { rules: data.data || [] } };
    }
  } catch (err) {
    console.error("Failed to fetch rules", err);
  }
  return { evidence: { rules: [] } };
}

// Node D: Memory/TM Retrieval (Vector Search)
async function retrieveMemory(state: typeof GraphState.State) {
  console.log("--- RETRIEVING MEMORY ---");
  try {
    const res = await fetch("http://localhost:33080/api/rag/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: state.query,
        limit: 3
      })
    });
    if (res.ok) {
      const data = await res.json();
      return { evidence: { memory: data.data || [] } };
    }
  } catch (err) {
    console.error("Failed to fetch memory", err);
  }
  return { evidence: { memory: [] } };
}

// Node E: Topo/Graph Retrieval (Neo4j Search)
async function retrieveGraph(state: typeof GraphState.State) {
  console.log("--- RETRIEVING GRAPH CONTEXT ---");
  try {
    const res = await fetch("http://localhost:33080/api/rag/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: state.query,
      })
    });
    if (res.ok) {
      const data = await res.json();
      return { evidence: { graph: data.data || [] } };
    }
  } catch (err) {
    console.error("Failed to fetch graph context", err);
  }
  return { evidence: { graph: [] } };
}

// Node F: Document Retrieval (Qdrant Search)
async function retrieveDocs(state: typeof GraphState.State) {
  console.log("--- RETRIEVING DOCS ---");
  try {
    const res = await fetch("http://localhost:33080/api/rag/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: state.query,
      })
    });
    if (res.ok) {
      const data = await res.json();
      return { evidence: { docs: data.data || [] } };
    }
  } catch (err) {
    console.error("Failed to fetch docs context", err);
  }
  return { evidence: { docs: [] } };
}

// Node G: Generation / Synthesis
async function generateResponse(state: typeof GraphState.State) {
  console.log("--- GENERATING RESPONSE ---");
  const { query, segmentContext, evidence } = state;

  const prompt = `You are an expert Code Reviewer and Translation Assistant.
Answer the user's query based ONLY on the provided evidence.

CRITICAL FUSION RULE (Explain Why):
For every piece of advice or review comment you provide, you MUST explicitly state the source evidence and explain WHY it is relevant. 
- If using TERM: "Based on the Termbase [term_name]..."
- If using RULE: "According to the architectural rule..."
- If using MEMORY: "Similar to previous memory snippets..."
- If using GRAPH: "Based on the topological graph relationship..."
- If using DOC: "Referencing the ADR/Document..."
If no evidence is directly applicable, state that you are operating on generic knowledge and explain the reasoning.

EVIDENCE:
${JSON.stringify(evidence, null, 2)}

SEGMENT CONTEXT:
${segmentContext ? `Source: ${segmentContext.source}\nTarget: ${segmentContext.target}` : "None"}

USER QUERY: ${query}`;

  const response = await llm.invoke([new SystemMessage(prompt)]);
  return { finalResponse: response.content as string };
}

// --- 4. Define Conditional Edges ---
function decideNextNodes(state: typeof GraphState.State) {
  const { intents } = state;
  const nextNodes: string[] = [];
  
  if (intents.includes("TERM")) nextNodes.push("retrieveTerms");
  if (intents.includes("RULE")) nextNodes.push("retrieveRules");
  if (intents.includes("MEMORY")) nextNodes.push("retrieveMemory");
  if (intents.includes("GRAPH")) nextNodes.push("retrieveGraph");
  if (intents.includes("DOC")) nextNodes.push("retrieveDocs");
  
  if (nextNodes.length === 0) {
    return ["generateResponse"];
  }
  return nextNodes;
}

// --- 5. Build Graph ---
const workflow = new StateGraph(GraphState)
  .addNode("routeIntent", routeIntent)
  .addNode("retrieveTerms", retrieveTerms)
  .addNode("retrieveRules", retrieveRules)
  .addNode("retrieveMemory", retrieveMemory)
  .addNode("retrieveGraph", retrieveGraph)
  .addNode("retrieveDocs", retrieveDocs)
  .addNode("generateResponse", generateResponse)
  
  .addEdge(START, "routeIntent")
  .addConditionalEdges("routeIntent", decideNextNodes)
  .addEdge("retrieveTerms", "generateResponse")
  .addEdge("retrieveRules", "generateResponse")
  .addEdge("retrieveMemory", "generateResponse")
  .addEdge("retrieveGraph", "generateResponse")
  .addEdge("retrieveDocs", "generateResponse")
  .addEdge("generateResponse", END);

export const reviewGraph = workflow.compile();

import { NextRequest } from "next/server";
import type { AnalysisFinding } from "@/lib/analysis-store";

/**
 * POST /api/ai-review/stream
 *
 * Accepts a JSON body:
 *   { lines, language, tbEntries, tmEntries }
 *
 * Calls the configured AI API (Anthropic or OpenAI-compatible) with
 * streaming enabled. The LLM is instructed to output one JSON finding
 * per line (NDJSON). Each parsed finding is forwarded to the client as
 * an SSE "data:" event immediately.
 *
 * Final event: data: {"done":true}
 */

const ANTHROPIC_VERSION = "2023-06-01";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified / 简体中文)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  de: "German (Deutsch)",
  fr: "French (Français)",
  es: "Spanish (Español)",
};

function buildSystemPrompt(
  language: string,
  tbEntries: { source_term: string; target_term: string; forbidden: boolean; domain?: string | null; definition?: string | null }[],
  tmEntries: { source_text: string; target_text: string }[],
): string {
  const langName = LANGUAGE_NAMES[language] || "English";

  const tbContext =
    tbEntries.length > 0
      ? `\n\nTERMINOLOGY BASE (enforce these rules):\n` +
        tbEntries
          .map(
            (e) =>
              `- "${e.source_term}" → "${e.target_term}"` +
              (e.forbidden ? " [FORBIDDEN — flag any usage]" : "") +
              (e.domain ? ` (domain: ${e.domain})` : "") +
              (e.definition ? `: ${e.definition}` : ""),
          )
          .join("\n")
      : "";

  const tmContext =
    tmEntries.length > 0
      ? `\n\nTRANSLATION MEMORY (reference patterns from past reviews):\n` +
        tmEntries
          .slice(0, 12)
          .map((e) => `- "${e.source_text}" → "${e.target_text}"`)
          .join("\n")
      : "";

  return `You are a senior code reviewer specializing in security, architecture, and code quality.
Respond in ${langName}.${tbContext}${tmContext}

Analyze each provided code line. For every issue or observation worth noting, output EXACTLY one JSON object on its own line:
{"lineId":<number>,"severity":"info|warning|danger|error","category":"<string>","message":"<concise finding in ${langName}>","suggestedFix":"<concrete fix or null>"}

severity guide:
  info    — observation / style suggestion
  warning — should be fixed; technical debt or non-compliance
  danger  — must be fixed; security, correctness, or architectural violation
  error   — critical issue; will cause failure or security breach

category examples: Security, Architecture, Terminology, Performance, Quality, Pattern Match, Compliance

Rules:
• Only output JSON lines, one finding per line.
• Do NOT include markdown, code blocks, or any non-JSON text.
• Finish with exactly this line: {"done":true}
• Skip lines with no issues — don't generate findings for clean code.
• Cross-reference TERMINOLOGY BASE when applicable.`;
}

// ── Demo findings (used when no API key is configured) ────────────────

function demofFindings(lines: { id: number; source: string }[]): AnalysisFinding[] {
  return lines.flatMap((l): AnalysisFinding[] => {
    if (l.source.includes("getSession") || l.source.includes("validateAuthorization")) {
      return [{
        lineId: l.id,
        severity: "warning",
        category: "Terminology",
        message: "TB mismatch: 'getSession' should be 'validateAuthorization' per Auth-Standard-2026.",
        suggestedFix: "Replace getSession(req) with validateAuthorization(req)",
      }];
    }
    if (l.source.includes("eval(") || l.source.includes("innerHTML")) {
      return [{
        lineId: l.id,
        severity: "error",
        category: "Security",
        message: "Dangerous eval/innerHTML usage — potential XSS vulnerability.",
        suggestedFix: "Remove eval() or use textContent instead of innerHTML",
      }];
    }
    if (l.source.includes("password") && l.source.includes("console")) {
      return [{
        lineId: l.id,
        severity: "danger",
        category: "Security",
        message: "Potential credential exposure via console logging.",
        suggestedFix: "Remove console.log of sensitive data",
      }];
    }
    return [];
  });
}

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    lines = [],
    language = "en",
    tbEntries = [],
    tmEntries = [],
  } = body;

  const apiKey = process.env.CATEST_AI_API_KEY;
  const baseUrl = process.env.CATEST_AI_BASE_URL || "https://api.anthropic.com/v1";
  const model = process.env.CATEST_AI_MODEL || "claude-sonnet-4-5";

  const encoder = new TextEncoder();

  // ── Demo mode when no real key ──────────────────────────────────────
  if (!apiKey || apiKey === "sk-your-api-key-here") {
    const stream = new ReadableStream({
      start(controller) {
        const findings = demofFindings(lines);
        for (const f of findings) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(f)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  const isAnthropic = baseUrl.includes("anthropic.com");
  const systemPrompt = buildSystemPrompt(language, tbEntries, tmEntries);
  const codeBlock = (lines as { id: number; source: string }[])
    .map((l) => `[LINE ${l.id}] ${l.source}`)
    .join("\n");

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        // ── Call AI API with streaming ──────────────────────────────
        let upstream: Response;

        if (isAnthropic) {
          upstream = await fetch(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
              model,
              max_tokens: 4096,
              stream: true,
              system: systemPrompt,
              messages: [{ role: "user", content: `Review this code:\n\n${codeBlock}` }],
            }),
          });
        } else {
          // OpenAI-compatible
          upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              max_tokens: 4096,
              stream: true,
              temperature: 0.15,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Review this code:\n\n${codeBlock}` },
              ],
            }),
          });
        }

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          send({ error: `API ${upstream.status}: ${errText.slice(0, 200)}` });
          send({ done: true });
          controller.close();
          return;
        }

        // ── Parse streaming response ─────────────────────────────────
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let sseBuf = "";   // incoming SSE lines from API
        let textBuf = "";  // accumulated LLM text output (for NDJSON parsing)

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuf += decoder.decode(value, { stream: true });
          const sseLines = sseBuf.split("\n");
          sseBuf = sseLines.pop() ?? "";

          for (const sseLine of sseLines) {
            if (!sseLine.startsWith("data: ")) continue;
            const payload = sseLine.slice(6).trim();
            if (!payload || payload === "[DONE]") continue;

            let textChunk = "";
            try {
              const event = JSON.parse(payload);
              if (isAnthropic) {
                if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                  textChunk = event.delta.text ?? "";
                }
              } else {
                textChunk = event.choices?.[0]?.delta?.content ?? "";
              }
            } catch {
              continue; // skip malformed SSE payloads
            }

            if (!textChunk) continue;
            textBuf += textChunk;

            // Try to parse complete newline-delimited JSON objects
            const textLines = textBuf.split("\n");
            textBuf = textLines.pop() ?? "";

            for (const line of textLines) {
              const t = line.trim();
              if (!t) continue;
              try {
                const obj = JSON.parse(t);
                if (obj.done === true) {
                  send({ done: true });
                } else if (typeof obj.lineId === "number") {
                  // Valid finding — forward to client immediately
                  send(obj as AnalysisFinding);
                }
              } catch {
                // Incomplete / non-JSON line — skip
              }
            }
          }
        }

        // Handle any remaining buffered text
        if (textBuf.trim()) {
          try {
            const obj = JSON.parse(textBuf.trim());
            if (typeof obj.lineId === "number") send(obj as AnalysisFinding);
          } catch {}
        }

        send({ done: true });
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Stream failed";
        send({ error: msg });
        send({ done: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

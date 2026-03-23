"use server";

/**
 * AI Code Review — Server Action
 * Calls an OpenAI-compatible API to generate line-by-line code comments.
 * Configured via environment variables:
 *   CATEST_AI_API_KEY   — API key
 *   CATEST_AI_BASE_URL  — Base URL (default: https://api.openai.com/v1)
 *   CATEST_AI_MODEL     — Model name (default: gpt-4o-mini)
 */

interface CodeLine {
  id: number;
  source: string;
  target: string;
}

interface CommentResult {
  lineId: number;
  comment: string;
}

const LANGUAGE_PROMPTS: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified / 简体中文)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  de: "German (Deutsch)",
  fr: "French (Français)",
  es: "Spanish (Español)",
};

export async function analyzeCodeWithAI(
  lines: CodeLine[],
  language: string = "en"
): Promise<{ comments: CommentResult[]; error?: string }> {
  const apiKey = process.env.CATEST_AI_API_KEY;
  const baseUrl = process.env.CATEST_AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.CATEST_AI_MODEL || "gpt-4o-mini";

  if (!apiKey || apiKey === "sk-your-api-key-here") {
    // Fallback: generate demo comments when no API key is configured
    return {
      comments: generateDemoComments(lines, language),
    };
  }

  const langName = LANGUAGE_PROMPTS[language] || "English";

  const codeBlock = lines
    .map((l) => `[LINE ${l.id}] SOURCE: ${l.source}\n[LINE ${l.id}] TARGET: ${l.target}`)
    .join("\n");

  const systemPrompt = `You are a senior code reviewer. Analyze the given code and provide a concise comment for EACH line.
Your comments should cover: correctness, security, performance, best practices, and any issues found.
Respond in ${langName}.
Format: Return a JSON array of objects with "lineId" (number) and "comment" (string).
Example: [{"lineId":1,"comment":"Function signature looks correct."},{"lineId":2,"comment":"Consider using a more specific type."}]
ONLY return the JSON array, no markdown, no explanation.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this code and comment on each line:\n\n${codeBlock}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return {
        comments: generateDemoComments(lines, language),
        error: `API returned ${response.status}. Using demo comments.`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        comments: generateDemoComments(lines, language),
        error: "Empty API response. Using demo comments.",
      };
    }

    // Parse JSON — handle potential markdown wrapping
    let parsed: CommentResult[];
    try {
      const jsonStr = content.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
      parsed = JSON.parse(jsonStr);
    } catch {
      return {
        comments: generateDemoComments(lines, language),
        error: "Failed to parse AI response. Using demo comments.",
      };
    }

    return { comments: parsed };
  } catch (err) {
    console.error("AI analysis failed:", err);
    return {
      comments: generateDemoComments(lines, language),
      error: `Network error. Using demo comments.`,
    };
  }
}

/**
 * Demo comments used when AI API is not configured
 */
function generateDemoComments(lines: CodeLine[], lang: string): CommentResult[] {
  const demoComments: Record<string, Record<number, string>> = {
    en: {
      1: "Entry point — async handler follows RESTful convention. Signature verified.",
      2: "⚠ CHANGED: getSession → validateAuthorization. Aligns with Auth-Standard-2026.",
      3: "Guard clause for unauthorized access. Returns 401 per HTTP spec. Correct.",
      4: "⚠ CHANGED: Added req.signal for cancellation support. Good lifecycle practice.",
      5: "Function closure. No issues.",
    },
    zh: {
      1: "入口函数 — 异步处理器遵循RESTful规范，签名已验证。",
      2: "⚠ 已修改：getSession → validateAuthorization。符合Auth-Standard-2026标准。",
      3: "未授权访问的守卫子句，返回401符合HTTP规范。正确。",
      4: "⚠ 已修改：添加req.signal用于取消支持，良好的生命周期管理实践。",
      5: "函数闭合。无问题。",
    },
    ja: {
      1: "エントリポイント — 非同期ハンドラがRESTful規約に準拠。署名確認済み。",
      2: "⚠ 変更: getSession → validateAuthorization。Auth-Standard-2026に準拠。",
      3: "未認証アクセスのガード節。HTTP仕様通り401を返す。正しい。",
      4: "⚠ 変更: キャンセルサポートのためreq.signalを追加。優れたライフサイクル管理。",
      5: "関数クロージャ。問題なし。",
    },
    ko: {
      1: "진입점 — 비동기 핸들러가 RESTful 규칙을 따릅니다. 서명 확인됨.",
      2: "⚠ 변경: getSession → validateAuthorization. Auth-Standard-2026 준수.",
      3: "인증되지 않은 접근에 대한 가드 절. HTTP 사양에 따라 401 반환. 정확함.",
      4: "⚠ 변경: 취소 지원을 위해 req.signal 추가. 좋은 수명 주기 관리.",
      5: "함수 종료. 문제 없음.",
    },
    de: {
      1: "Einstiegspunkt — Async-Handler folgt RESTful-Konvention. Signatur verifiziert.",
      2: "⚠ GEÄNDERT: getSession → validateAuthorization. Entspricht Auth-Standard-2026.",
      3: "Schutzklausel für unauthorisierten Zugriff. Gibt 401 gemäß HTTP-Spezifikation zurück.",
      4: "⚠ GEÄNDERT: req.signal für Abbruchunterstützung hinzugefügt. Gute Lifecycle-Praxis.",
      5: "Funktionsabschluss. Keine Probleme.",
    },
  };

  const comments = demoComments[lang] || demoComments.en;

  return lines.map((line) => ({
    lineId: line.id,
    comment: comments[line.id] || (lang === "zh" ? "自动分析完成。" : "Analysis complete."),
  }));
}

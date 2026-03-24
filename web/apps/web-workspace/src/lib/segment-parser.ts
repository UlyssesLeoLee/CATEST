/**
 * Segment Parser — splits code files into reviewable segments.
 *
 * Segments are the basic translation/review unit (like sentences in CAT).
 * For code, a "segment" is a logical block: function, class, method,
 * config block, import group, or statement group.
 *
 * This is a heuristic parser that works across common languages without
 * requiring a full AST.  The output is used to generate .catest files.
 */

export type SegmentKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "enum"
  | "config_block"
  | "sql_block"
  | "statement_group"
  | "file_header"
  | "other";

export interface ParsedSegment {
  /** 1-based index within the file */
  index: number;
  kind: SegmentKind;
  /** Symbol name: function/class name, or null for anonymous blocks */
  symbolName: string | null;
  /** The source code text of this segment */
  code: string;
  /** Starting line (1-based) in the original file */
  startLine: number;
  /** Ending line (1-based) in the original file */
  endLine: number;
}

// ── Language detection ───────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", pyw: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin", kts: "kotlin",
  cs: "csharp",
  cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c", h: "c", hpp: "cpp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  scala: "scala",
  dart: "dart",
  lua: "lua",
  sh: "shell", bash: "shell", zsh: "shell",
  ps1: "powershell", psm1: "powershell",
  sql: "sql",
  json: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  xml: "xml", svg: "xml",
  html: "html", htm: "html",
  css: "css", scss: "css", less: "css",
  md: "markdown",
  dockerfile: "dockerfile",
};

export function detectLanguage(filePath: string): string | null {
  const base = filePath.split(/[/\\]/).pop() || "";
  // Special filenames
  if (/^dockerfile$/i.test(base)) return "dockerfile";
  if (/^makefile$/i.test(base)) return "makefile";
  if (/^\.env/i.test(base)) return "env";

  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : null;
  if (!ext) return null;
  return EXT_TO_LANG[ext] || null;
}

// ── Code-aware file extensions ───────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "pyw",
  "rs", "go", "java", "kt", "kts", "cs",
  "cpp", "cc", "cxx", "c", "h", "hpp",
  "rb", "php", "swift", "scala", "dart", "lua",
  "sh", "bash", "zsh", "ps1", "psm1",
  "sql",
  "json", "yaml", "yml", "toml",
  "xml", "svg", "html", "htm",
  "css", "scss", "less",
  "md", "mdx",
  "dockerfile",
  "proto", "graphql", "gql",
  "vue", "svelte",
]);

/** Check if a file path is a code/text file worth importing */
export function isCodeFile(filePath: string): boolean {
  const base = (filePath.split(/[/\\]/).pop() || "").toLowerCase();
  // Special filenames
  if (/^(dockerfile|makefile|\.env|\.gitignore|\.editorconfig|cmakelists\.txt)$/i.test(base)) return true;
  const ext = base.includes(".") ? base.split(".").pop() : null;
  if (!ext) return false;
  return CODE_EXTENSIONS.has(ext);
}

/** Skip patterns — directories & files that should never be imported */
const SKIP_PATTERNS = [
  /node_modules/i,
  /\.git\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\.cache\//,
  /__pycache__\//,
  /\.venv\//,
  /target\/debug\//,
  /target\/release\//,
  /\.DS_Store$/,
  /thumbs\.db$/i,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

export function shouldSkip(filePath: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(filePath));
}

// ── Main parser ──────────────────────────────────────────────────────

/**
 * Parse a source file into segments.
 *
 * Strategy:
 * 1. For C-family / brace languages: split on top-level constructs
 *    (function, class, interface, enum declarations).
 * 2. For Python: split on `def`, `class` at indent level 0.
 * 3. For config/data files (JSON, YAML, TOML): treat entire file as one segment.
 * 4. Fallback: split by blank-line-separated groups.
 */
export function parseSegments(source: string, filePath: string): ParsedSegment[] {
  const lang = detectLanguage(filePath);
  const lines = source.split("\n");

  if (!lang || lines.length === 0) {
    return wholeFileSegment(source, lines.length);
  }

  // Config/data files → single segment
  if (["json", "yaml", "toml", "env", "xml", "html", "css", "markdown", "dockerfile"].includes(lang)) {
    return wholeFileSegment(source, lines.length);
  }

  // Python
  if (lang === "python") {
    return parsePython(lines);
  }

  // SQL
  if (lang === "sql") {
    return parseSql(lines);
  }

  // Shell / PowerShell
  if (lang === "shell" || lang === "powershell") {
    return parseShell(lines);
  }

  // C-family brace languages (TS, JS, Go, Rust, Java, C#, C/C++, etc.)
  return parseBraceLanguage(lines);
}

// ── Whole file as one segment ────────────────────────────────────────

function wholeFileSegment(source: string, lineCount: number): ParsedSegment[] {
  return [{
    index: 1,
    kind: "config_block",
    symbolName: null,
    code: source,
    startLine: 1,
    endLine: lineCount,
  }];
}

// ── Brace-language parser ────────────────────────────────────────────

const BRACE_DECL = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|enum\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function))/;

function parseBraceLanguage(lines: string[]): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let headerEnd = 0;

  // Detect file header (imports, comments at top)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("require(") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("use ") ||
      trimmed.startsWith("package ") ||
      trimmed.startsWith("module ") ||
      trimmed.startsWith("using ") ||
      trimmed.startsWith("#include") ||
      trimmed.startsWith("#pragma") ||
      trimmed.startsWith("\"use ")
    ) {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  if (headerEnd > 0) {
    segments.push({
      index: segments.length + 1,
      kind: "file_header",
      symbolName: null,
      code: lines.slice(0, headerEnd).join("\n"),
      startLine: 1,
      endLine: headerEnd,
    });
  }

  // Scan for top-level declarations
  let i = headerEnd;
  let blockStart = -1;
  let braceDepth = 0;
  let currentKind: SegmentKind = "other";
  let currentName: string | null = null;
  let pendingLines: string[] = [];

  function flushPending(endIdx: number) {
    if (pendingLines.length > 0) {
      const code = pendingLines.join("\n").trim();
      if (code) {
        segments.push({
          index: segments.length + 1,
          kind: "statement_group",
          symbolName: null,
          code,
          startLine: blockStart + 1,
          endLine: endIdx,
        });
      }
      pendingLines = [];
      blockStart = -1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (braceDepth === 0) {
      const m = BRACE_DECL.exec(trimmed);
      if (m) {
        flushPending(i);
        const name = m[1] || m[2] || m[3] || m[4] || m[5] || null;
        currentKind = m[2] ? "class" : m[3] ? "interface" : m[4] ? "enum" : "function";
        currentName = name;
        blockStart = i;

        // Count braces on this line
        for (const ch of line) {
          if (ch === "{") braceDepth++;
          if (ch === "}") braceDepth--;
        }

        // If declaration has no braces (forward decl / type alias), single line
        if (braceDepth <= 0) {
          braceDepth = 0;
          segments.push({
            index: segments.length + 1,
            kind: currentKind,
            symbolName: currentName,
            code: line,
            startLine: i + 1,
            endLine: i + 1,
          });
          blockStart = -1;
        }

        i++;
        continue;
      }

      // Not a declaration — accumulate as pending statement group
      if (trimmed !== "") {
        if (blockStart < 0) blockStart = i;
        pendingLines.push(line);
      } else if (pendingLines.length > 0) {
        // Blank line after some statements — flush
        flushPending(i);
      }
    } else {
      // Inside a brace block — keep counting
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth <= 0) {
        braceDepth = 0;
        segments.push({
          index: segments.length + 1,
          kind: currentKind,
          symbolName: currentName,
          code: lines.slice(blockStart, i + 1).join("\n"),
          startLine: blockStart + 1,
          endLine: i + 1,
        });
        blockStart = -1;
      }
    }

    i++;
  }

  // Flush remaining
  if (braceDepth > 0 && blockStart >= 0) {
    segments.push({
      index: segments.length + 1,
      kind: currentKind,
      symbolName: currentName,
      code: lines.slice(blockStart).join("\n"),
      startLine: blockStart + 1,
      endLine: lines.length,
    });
  } else {
    flushPending(lines.length);
  }

  // If nothing detected, return whole file
  if (segments.length === 0) return wholeFileSegment(lines.join("\n"), lines.length);
  return segments;
}

// ── Python parser ────────────────────────────────────────────────────

function parsePython(lines: string[]): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let i = 0;

  // Header (imports, comments)
  let headerEnd = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("#") || t.startsWith("import ") || t.startsWith("from ") || t.startsWith('"""') || t.startsWith("'''")) {
      headerEnd = i + 1;
    } else break;
  }
  if (headerEnd > 0) {
    segments.push({ index: 1, kind: "file_header", symbolName: null, code: lines.slice(0, headerEnd).join("\n"), startLine: 1, endLine: headerEnd });
  }

  i = headerEnd;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const defMatch = /^(async\s+)?def\s+(\w+)/.exec(t);
    const classMatch = /^class\s+(\w+)/.exec(t);

    if (defMatch || classMatch) {
      const start = i;
      const indent = line.search(/\S/);
      i++;
      // Collect body: lines with greater indent or blank
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.trim() === "") { i++; continue; }
        const nextIndent = nextLine.search(/\S/);
        if (nextIndent <= indent) break;
        i++;
      }
      segments.push({
        index: segments.length + 1,
        kind: classMatch ? "class" : "function",
        symbolName: classMatch ? classMatch[1] : (defMatch![2] || null),
        code: lines.slice(start, i).join("\n"),
        startLine: start + 1,
        endLine: i,
      });
    } else if (t === "" || t.startsWith("#")) {
      i++;
    } else {
      // Statement group
      const start = i;
      while (i < lines.length && lines[i].trim() !== "" && !/^(async\s+)?def\s+/.test(lines[i].trim()) && !/^class\s+/.test(lines[i].trim())) {
        i++;
      }
      segments.push({
        index: segments.length + 1,
        kind: "statement_group",
        symbolName: null,
        code: lines.slice(start, i).join("\n"),
        startLine: start + 1,
        endLine: i,
      });
    }
  }

  if (segments.length === 0) return wholeFileSegment(lines.join("\n"), lines.length);
  return segments;
}

// ── SQL parser ───────────────────────────────────────────────────────

function parseSql(lines: string[]): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const blocks: string[] = [];
  let blockStart = 0;

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : "";
    if (line.trim() === "" && blocks.length > 0) {
      const code = blocks.join("\n").trim();
      if (code) {
        const nameMatch = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE|INDEX|TYPE|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?)([\w."]+)/i.exec(code);
        segments.push({
          index: segments.length + 1,
          kind: "sql_block",
          symbolName: nameMatch ? nameMatch[1].replace(/"/g, "") : null,
          code,
          startLine: blockStart + 1,
          endLine: i,
        });
      }
      blocks.length = 0;
      blockStart = i + 1;
    } else {
      if (blocks.length === 0) blockStart = i;
      blocks.push(line);
    }
  }

  if (segments.length === 0) return wholeFileSegment(lines.join("\n"), lines.length);
  return segments;
}

// ── Shell parser ─────────────────────────────────────────────────────

function parseShell(lines: string[]): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let i = 0;

  // Shebang + header comments
  let headerEnd = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("#") || t.startsWith("set ")) headerEnd = i + 1;
    else break;
  }
  if (headerEnd > 0) {
    segments.push({ index: 1, kind: "file_header", symbolName: null, code: lines.slice(0, headerEnd).join("\n"), startLine: 1, endLine: headerEnd });
  }

  i = headerEnd;
  while (i < lines.length) {
    const t = lines[i].trim();
    const funcMatch = /^(?:function\s+)?(\w+)\s*\(\)/.exec(t);
    if (funcMatch) {
      const start = i;
      i++;
      let depth = 0;
      if (t.includes("{")) depth++;
      while (i < lines.length && depth > 0) {
        for (const ch of lines[i]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        i++;
      }
      if (depth <= 0 && i > start) {
        segments.push({
          index: segments.length + 1,
          kind: "function",
          symbolName: funcMatch[1],
          code: lines.slice(start, i).join("\n"),
          startLine: start + 1,
          endLine: i,
        });
        continue;
      }
    }

    // Group consecutive non-blank non-function lines
    if (t !== "" && !t.startsWith("#")) {
      const start = i;
      while (i < lines.length && lines[i].trim() !== "" && !/^(?:function\s+)?(\w+)\s*\(\)/.test(lines[i].trim())) {
        i++;
      }
      segments.push({
        index: segments.length + 1,
        kind: "statement_group",
        symbolName: null,
        code: lines.slice(start, i).join("\n"),
        startLine: start + 1,
        endLine: i,
      });
    } else {
      i++;
    }
  }

  if (segments.length === 0) return wholeFileSegment(lines.join("\n"), lines.length);
  return segments;
}

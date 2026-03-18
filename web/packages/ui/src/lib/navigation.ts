export const isSaaSMode = process.env.NEXT_PUBLIC_SAAS_MODE === "true";

export const APP_URLS = {
  base: isSaaSMode ? "/" : `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || "33000"}`,
  workspace: isSaaSMode ? "/workspace" : `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_WORKSPACE || "33001"}`,
  rag: isSaaSMode ? "/rag" : `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_RAG || "33002"}`,
  review: isSaaSMode ? "/review" : `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_REVIEW || "33003"}`,
  team: isSaaSMode ? "/team" : `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_TEAM || "33004"}`,
};

export function getAppUrl(app: keyof typeof APP_URLS, path: string = "") {
  const baseUrl = APP_URLS[app];
  if (!path) return baseUrl;
  
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

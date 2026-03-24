import { Pool } from "pg";

/**
 * Connection pool for the catest_workspace database.
 * Stores parsed segments from code files.
 */
function getWorkspaceDbUrl(): string {
  if (process.env.WORKSPACE_DATABASE_URL) return process.env.WORKSPACE_DATABASE_URL;

  const gatewayUrl = process.env.DATABASE_URL;
  if (gatewayUrl) {
    return gatewayUrl.replace(/\/catest_gateway$/, "/catest_workspace");
  }

  const port = process.env.POSTGRES_PORT || "34321";
  const host = process.env.POSTGRES_HOST || "localhost";
  const user = process.env.POSTGRES_USER || "catest";
  const pass = process.env.POSTGRES_PASSWORD || "password";
  return `postgres://${user}:${pass}@${host}:${port}/catest_workspace`;
}

const globalForWs = global as unknown as { wsPool: Pool };

export const wsPool =
  globalForWs.wsPool ||
  new Pool({
    connectionString: getWorkspaceDbUrl(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: false,
  });

if (process.env.NODE_ENV !== "production") globalForWs.wsPool = wsPool;

export async function wsQuery(text: string, params?: unknown[]) {
  try {
    return await wsPool.query(text, params as unknown[]);
  } catch (error: any) {
    console.error("Workspace DB Query Error:", error.message);
    throw error;
  }
}

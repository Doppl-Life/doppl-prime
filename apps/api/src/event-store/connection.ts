import pg from "pg";

/**
 * Thrown when `createPool` is called without an explicit `connectionString`
 * and `process.env.DATABASE_URL` is also unset. Per `ARCHITECTURE.md §15`
 * the kernel fails fast at boot rather than at first DB call.
 */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Either pass a connectionString to createPool() " +
        "or set DATABASE_URL in the environment. See .env.example for the local default.",
    );
    this.name = "MissingDatabaseUrlError";
  }
}

export interface CreatePoolOptions {
  connectionString?: string;
  max?: number;
}

/**
 * Build a node-postgres connection pool. Connection is LAZY — the pool is
 * returned without dialing the database. This lets unit tests construct a
 * pool against an invalid URL and `end()` it without ever touching the
 * network.
 */
export function createPool(options: CreatePoolOptions = {}): pg.Pool {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) throw new MissingDatabaseUrlError();
  return new pg.Pool({
    connectionString,
    ...(options.max !== undefined ? { max: options.max } : {}),
  });
}

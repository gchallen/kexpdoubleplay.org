export interface Env {
  DB: D1Database;
  // Secrets (wrangler secret put)
  ADMIN_TOKEN: string;
  // Vars (wrangler.toml)
  NTFY_TOPIC: string;
  KEXP_API_BASE_URL: string;
}

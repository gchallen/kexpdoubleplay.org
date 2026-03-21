export interface Env {
  DB: D1Database;
  // Secrets (wrangler secret put)
  RESEND_API_KEY: string;
  ADMIN_TOKEN: string;
  // Vars (wrangler.toml)
  NOTIFICATION_EMAIL: string;
  RESEND_FROM_EMAIL: string;
  KEXP_API_BASE_URL: string;
}

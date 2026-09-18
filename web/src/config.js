/**
 * Supabase connection details.
 *
 * The anon key is committed on purpose. It is a public identifier, not a credential --
 * Supabase expects it in client code, and row-level security is the actual boundary
 * (see supabase/schema.sql: select and insert only, no update, no delete). Committing
 * it keeps local development a single static-server command with no setup.
 *
 * The owner fills these in during setup; until then the leaderboard reports itself
 * unavailable and the game plays normally.
 */
export const SUPABASE_URL = 'https://REPLACE_ME.supabase.co';
export const SUPABASE_ANON_KEY = 'REPLACE_ME';

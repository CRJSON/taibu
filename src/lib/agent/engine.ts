/**
 * Pi Durable engine generation recorded in worker heartbeats and native (V2)
 * checkpoints. Bumped together with the pinned runtime (1.0.4 → 1.1.0); the SQL
 * engine whitelist and native-run claim gating live in
 * supabase/migrations/20261009_100000_agent_pi_durable_1_1.sql, which keeps
 * accepting the historical pi-durable/1.0.4 marker for existing runs.
 */
export const AGENT_ENGINE = "pi-durable/1.1.0";

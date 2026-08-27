import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeEach } from "vitest";

beforeEach(async () => {
  await applyD1Migrations(env.QUEUE_DB, env.TEST_MIGRATIONS);
  await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare("DELETE FROM sessions"),
    env.QUEUE_DB.prepare("DELETE FROM queue_meta"),
    env.QUEUE_DB.prepare("DELETE FROM closure_reports"),
    env.QUEUE_DB.prepare("DELETE FROM queue_overrides"),
    env.QUEUE_DB.prepare("DELETE FROM settings"),
    env.QUEUE_DB.prepare("DELETE FROM denylist"),
    env.QUEUE_DB.prepare("DELETE FROM admin_log"),
    env.QUEUE_DB.prepare("DELETE FROM report_events"),
    env.QUEUE_DB.prepare("DELETE FROM queue_stats_hourly"),
  ]);
});

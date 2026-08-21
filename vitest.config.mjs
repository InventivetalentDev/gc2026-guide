import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(
  fileURLToPath(new URL("./worker/migrations", import.meta.url))
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      /* The API Worker is what these tests exercise; the site is assets with
         no script of its own. */
      wrangler: { configPath: "./wrangler-api.toml" },
      // The bundled local workerd currently trails the deployment date by
      // nine days. Keep production on today's compatibility date while tests
      // run against the newest semantics that this pinned pool provides.
      miniflare: {
        compatibilityDate: "2026-08-08",
        bindings: { TEST_MIGRATIONS: migrations },
        // Tests keep an isolated local binding even after the documented
        // post-show production binding removal, so the teardown deploy can
        // still pass the full historical regression suite.
        d1Databases: ["QUEUE_DB"],
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/apply-migrations.js"],
  },
});

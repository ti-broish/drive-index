import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GOOGLE_SERVICE_ACCOUNT_KEY: "{}",
          WEBHOOK_SECRET: "test-secret",
          FOLDER_ID: "test-folder-id",
          SPREADSHEET_ID: "test-sheet-id",
          SHEET_NAME: "files",
          WORKER_URL: "https://drive-index.example.com",
          WATCH_ENABLED: "false",
        },
      },
    }),
  ],
});

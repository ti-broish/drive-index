import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            GOOGLE_SERVICE_ACCOUNT_KEY: "{}",
            WEBHOOK_SECRET: "test-secret",
            FOLDER_ID: "test-folder-id",
            SPREADSHEET_ID: "test-sheet-id",
            WORKER_URL: "https://drive-index.example.com",
            WATCH_ENABLED: "false",
          },
        },
      },
    },
  },
});

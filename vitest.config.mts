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
          FOLDER_MAPPINGS: JSON.stringify([
            { folderId: "test-folder-1", spreadsheetId: "test-sheet-1", sheetName: "files" },
            { folderId: "test-folder-2", spreadsheetId: "test-sheet-2", sheetName: "unsigned" },
          ]),
          WORKER_URL: "https://drive-index.example.com",
          WATCH_ENABLED: "false",
        },
      },
    }),
  ],
});

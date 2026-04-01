# drive-index

Cloudflare Worker that watches a Google Drive folder for changes via webhooks, queues events, and syncs a complete file listing (name + ID) to a Google Sheet.

## Architecture

```
Google Drive push notification
        │
        ▼
┌───────────────────────┐
│  Worker  POST /webhook│──► CF Queue (batched)
│          POST /setup  │         │
│          POST /stop   │         ▼
│          POST /reindex│    Queue consumer:
│          GET  /       │    reindex folder → write Sheet
└───────────────────────┘
        ▲
        │
  Cron (every 5 days) — renews watch channel (if WATCH_ENABLED)
```

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or use an existing one).

2. **Enable APIs** — go to _APIs & Services → Library_ and enable:
   - **Google Drive API**
   - **Google Sheets API**

3. **Create a Service Account**:
   - Go to _APIs & Services → Credentials_
   - Click _Create Credentials → Service Account_
   - Name it (e.g. `drive-index-worker`)
   - No need to grant project-level roles
   - Click _Done_

4. **Create a key for the Service Account**:
   - Click on the service account you just created
   - Go to the _Keys_ tab
   - _Add Key → Create new key → JSON_
   - Download the JSON file — you'll need its contents as a secret

5. **Share the Drive folder** with the service account:
   - Copy the service account email (e.g. `drive-index-worker@project.iam.gserviceaccount.com`)
   - Open the Google Drive folder you want to index
   - Click _Share_ and add the service account email with **Viewer** access

6. **Share the Google Sheet** with the service account:
   - Create a new Google Sheet (or use an existing one)
   - Share it with the service account email with **Editor** access
   - Note the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

### 2. Cloudflare

1. **Install Wrangler** (if not already):
   ```bash
   pnpm install -g wrangler
   wrangler login
   ```

2. **Create the Queue**:
   ```bash
   wrangler queues create drive-index-events
   ```

3. **Set environment variables** in `wrangler.jsonc`:
   ```jsonc
   "vars": {
     "FOLDER_ID": "<your Google Drive folder ID>",
     "SPREADSHEET_ID": "<your Google Sheet ID>",
     "WORKER_URL": "https://drive-index.<your-subdomain>.workers.dev",
     "WATCH_ENABLED": "true"
   }
   ```

   The folder ID is in the Drive URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`

4. **Set secrets** (deploy will fail if these are missing):
   ```bash
   # Paste the entire JSON key file contents when prompted
   wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY

   # Generate a random secret for webhook verification
   wrangler secret put WEBHOOK_SECRET
   ```

   To generate a good secret:
   ```bash
   openssl rand -hex 32
   ```

5. **Deploy**:
   ```bash
   pnpm deploy
   ```

### 3. Register the Drive watch channel

Once deployed, register the webhook so Google Drive sends push notifications:

```bash
curl -X POST https://drive-index.<your-subdomain>.workers.dev/setup \
  -H "Authorization: Bearer <your-webhook-secret>"
```

This creates a watch channel that expires in ~7 days. The cron trigger (every 5 days) automatically renews it while `WATCH_ENABLED` is `"true"`.

### 4. Stopping the watch

Set `WATCH_ENABLED` to `"false"` in `wrangler.jsonc` and redeploy (or update via the CF dashboard). The cron will stop renewing the channel and it will expire within 7 days.

### 5. Manual reindex

To trigger a full reindex on demand:

```bash
curl -X POST https://drive-index.<your-subdomain>.workers.dev/reindex \
  -H "Authorization: Bearer <your-webhook-secret>"
```

## Local development

```bash
pnpm install

# Create .dev.vars with your secrets for local dev
cat > .dev.vars << 'EOF'
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
WEBHOOK_SECRET=your-secret-here
EOF

pnpm dev
```

## Tests

```bash
pnpm test
```

## How it works

1. **Webhook** — Google Drive sends a POST to `/webhook` when files change in the watched folder. The worker verifies the request using the channel token and enqueues an event.

2. **Queue consumer** — CF Queue batches events (max 50 or 30s timeout). The consumer recursively lists all files in the folder and its subfolders via the Drive API, then writes the full listing to the Google Sheet.

3. **Cron** — Every 5 days, the scheduled handler renews the Drive watch channel (channels expire after ~7 days max). Only runs when `WATCH_ENABLED` is `"true"`.

4. **Reindex** — `POST /reindex` triggers a manual full reindex without going through the queue.

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | None | Health check + watch status |
| `POST` | `/webhook` | `x-goog-channel-token` | Google Drive push notification receiver |
| `POST` | `/setup` | `Bearer <secret>` | Register Drive watch channel |
| `POST` | `/stop` | `Bearer <secret>` | Instructions to stop watching |
| `POST` | `/reindex` | `Bearer <secret>` | Trigger full reindex immediately |

## License

MIT

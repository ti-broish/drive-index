import { listFilesInFolder, setupWatch } from "./drive";
import { writeToSheet } from "./sheets";

export interface Env {
  DRIVE_EVENTS: Queue<DriveEvent>;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  WEBHOOK_SECRET: string;
  FOLDER_ID: string;
  SPREADSHEET_ID: string;
  WORKER_URL: string;
  WATCH_ENABLED: string;
}

interface DriveEvent {
  folderId: string;
  timestamp: number;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/setup") {
      return handleSetup(request, env);
    }

    if (request.method === "POST" && url.pathname === "/stop") {
      return handleStop(request, env);
    }

    if (request.method === "POST" && url.pathname === "/reindex") {
      return handleReindex(request, env);
    }

    if (url.pathname === "/") {
      return Response.json({
        status: "running",
        watchEnabled: env.WATCH_ENABLED === "true",
      });
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<DriveEvent>, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} events`);

    const files = await listFilesInFolder(
      env.GOOGLE_SERVICE_ACCOUNT_KEY,
      env.FOLDER_ID,
    );

    console.log(`Found ${files.length} files, writing to sheet`);

    await writeToSheet(
      env.GOOGLE_SERVICE_ACCOUNT_KEY,
      env.SPREADSHEET_ID,
      files,
    );

    console.log("Sheet updated successfully");
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (env.WATCH_ENABLED !== "true") {
      console.log("Cron: watch is disabled, skipping channel renewal");
      return;
    }

    console.log("Cron: renewing Drive watch channel");
    await setupWatch(
      env.GOOGLE_SERVICE_ACCOUNT_KEY,
      env.FOLDER_ID,
      `${env.WORKER_URL}/webhook`,
      env.WEBHOOK_SECRET,
    );
    console.log("Watch channel renewed");
  },
};

function requireAuth(request: Request, env: Env): Response | null {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  // Google sends the token we set during watch setup
  const token = request.headers.get("x-goog-channel-token");
  if (token !== env.WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Google sends a "sync" message when watch is first set up — ack it
  const state = request.headers.get("x-goog-resource-state");
  if (state === "sync") {
    return new Response("OK", { status: 200 });
  }

  await env.DRIVE_EVENTS.send({
    folderId: env.FOLDER_ID,
    timestamp: Date.now(),
  });

  return new Response("Queued", { status: 202 });
}

async function handleSetup(request: Request, env: Env): Promise<Response> {
  const denied = requireAuth(request, env);
  if (denied) return denied;

  const webhookUrl = `${env.WORKER_URL || new URL(request.url).origin}/webhook`;
  const result = await setupWatch(
    env.GOOGLE_SERVICE_ACCOUNT_KEY,
    env.FOLDER_ID,
    webhookUrl,
    env.WEBHOOK_SECRET,
  );

  return Response.json(result);
}

async function handleStop(request: Request, env: Env): Promise<Response> {
  const denied = requireAuth(request, env);
  if (denied) return denied;

  return Response.json({
    message:
      "Set WATCH_ENABLED to 'false' via wrangler secret or dashboard. " +
      "The cron will stop renewing the channel and it will expire within 7 days. " +
      "To stop immediately, call the Drive channels.stop API with the channel ID and resource ID from /setup response.",
  });
}

async function handleReindex(request: Request, env: Env): Promise<Response> {
  const denied = requireAuth(request, env);
  if (denied) return denied;

  const files = await listFilesInFolder(
    env.GOOGLE_SERVICE_ACCOUNT_KEY,
    env.FOLDER_ID,
  );

  await writeToSheet(
    env.GOOGLE_SERVICE_ACCOUNT_KEY,
    env.SPREADSHEET_ID,
    files,
  );

  return Response.json({ indexed: files.length });
}

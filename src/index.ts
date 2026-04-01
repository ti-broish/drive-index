import { listFilesInFolder, setupWatch } from "./drive";
import { writeToSheet } from "./sheets";

export interface Env {
  DRIVE_EVENTS: Queue<DriveEvent>;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  WEBHOOK_SECRET: string;
  FOLDER_ID: string;
  SPREADSHEET_ID: string;
}

interface DriveEvent {
  folderId: string;
  timestamp: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/setup") {
      return handleSetup(request, env);
    }

    if (request.method === "POST" && url.pathname === "/reindex") {
      return handleReindex(env);
    }

    if (url.pathname === "/") {
      return new Response("drive-index worker is running", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<DriveEvent>, env: Env): Promise<void> {
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
  ): Promise<void> {
    console.log("Cron: renewing Drive watch channel");
    const workerUrl = "https://drive-index.<your-subdomain>.workers.dev";
    await setupWatch(
      env.GOOGLE_SERVICE_ACCOUNT_KEY,
      env.FOLDER_ID,
      `${workerUrl}/webhook`,
      env.WEBHOOK_SECRET,
    );
    console.log("Watch channel renewed");
  },
};

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
  // Simple auth: require the webhook secret as a Bearer token
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const workerUrl = new URL(request.url).origin;
  const result = await setupWatch(
    env.GOOGLE_SERVICE_ACCOUNT_KEY,
    env.FOLDER_ID,
    `${workerUrl}/webhook`,
    env.WEBHOOK_SECRET,
  );

  return Response.json(result);
}

async function handleReindex(env: Env): Promise<Response> {
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

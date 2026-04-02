import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { Env } from "./index";
import worker from "./index";

const testEnv = env as unknown as Env;

describe("fetch handler", () => {
  it("returns status on GET /", async () => {
    const request = new Request("https://example.com/");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json<{ status: string; watchEnabled: boolean; folders: number }>();
    expect(body.status).toBe("running");
    expect(body.watchEnabled).toBe(false);
    expect(body.folders).toBe(2);
  });

  it("returns 404 for unknown routes", async () => {
    const request = new Request("https://example.com/unknown");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });

  it("rejects webhook without valid token", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-goog-channel-token": "wrong-token" },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it("accepts webhook sync message", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "x-goog-channel-token": "test-secret",
        "x-goog-resource-state": "sync",
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
  });

  it("queues event on valid webhook change notification", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "x-goog-channel-token": "test-secret",
        "x-goog-resource-state": "update",
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(202);
  });

  it("rejects /setup without auth", async () => {
    const request = new Request("https://example.com/setup", {
      method: "POST",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it("rejects /reindex without auth", async () => {
    const request = new Request("https://example.com/reindex", {
      method: "POST",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it("returns instructions on POST /stop with auth", async () => {
    const request = new Request("https://example.com/stop", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json<{ message: string }>();
    expect(body.message).toContain("WATCH_ENABLED");
  });
});

describe("scheduled handler", () => {
  it("skips renewal when WATCH_ENABLED is false", async () => {
    const controller = { scheduledTime: Date.now(), cron: "0 0 */5 * *", noRetry() {} };
    const ctx = createExecutionContext();
    // Should not throw — just skips silently
    await worker.scheduled(controller, testEnv, ctx);
    await waitOnExecutionContext(ctx);
  });
});

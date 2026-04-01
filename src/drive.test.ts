import { describe, it, expect, vi, beforeEach } from "vitest";
import { listFilesInFolder } from "./drive";

const FAKE_KEY = JSON.stringify({
  client_email: "test@test.iam.gserviceaccount.com",
  private_key: "fake",
  token_uri: "https://oauth2.googleapis.com/token",
});

beforeEach(() => {
  vi.restoreAllMocks();
});

// Helper to mock getAccessToken so we skip real JWT signing
vi.mock("./google-auth", () => ({
  getAccessToken: vi.fn().mockResolvedValue("fake-token"),
}));

function mockDriveResponses(responses: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      const q = u.searchParams.get("q") || "";
      const parentMatch = q.match(/'([^']+)' in parents/);
      const parentId = parentMatch?.[1] ?? "unknown";
      const pageToken = u.searchParams.get("pageToken");
      const key = pageToken ? `${parentId}:${pageToken}` : parentId;

      if (responses[key]) {
        return new Response(JSON.stringify(responses[key]));
      }
      return new Response(JSON.stringify({ files: [] }));
    }),
  );
}

describe("listFilesInFolder", () => {
  it("lists files in a flat folder", async () => {
    mockDriveResponses({
      "folder-1": {
        files: [
          { id: "f1", name: "file1.pdf", mimeType: "application/pdf" },
          { id: "f2", name: "file2.xlsx", mimeType: "application/vnd.ms-excel" },
        ],
      },
    });

    const files = await listFilesInFolder(FAKE_KEY, "folder-1");

    expect(files).toEqual([
      { name: "file1.pdf", id: "f1" },
      { name: "file2.xlsx", id: "f2" },
    ]);
  });

  it("recursively lists files in subfolders", async () => {
    mockDriveResponses({
      "root": {
        files: [
          { id: "f1", name: "top.pdf", mimeType: "application/pdf" },
          { id: "sub1", name: "subfolder", mimeType: "application/vnd.google-apps.folder" },
        ],
      },
      "sub1": {
        files: [
          { id: "f2", name: "nested.pdf", mimeType: "application/pdf" },
        ],
      },
    });

    const files = await listFilesInFolder(FAKE_KEY, "root");

    expect(files).toEqual([
      { name: "top.pdf", id: "f1" },
      { name: "subfolder", id: "sub1" },
      { name: "nested.pdf", id: "f2" },
    ]);
  });

  it("handles pagination", async () => {
    mockDriveResponses({
      "folder-p": {
        nextPageToken: "page2",
        files: [
          { id: "f1", name: "first.pdf", mimeType: "application/pdf" },
        ],
      },
      "folder-p:page2": {
        files: [
          { id: "f2", name: "second.pdf", mimeType: "application/pdf" },
        ],
      },
    });

    const files = await listFilesInFolder(FAKE_KEY, "folder-p");

    expect(files).toEqual([
      { name: "first.pdf", id: "f1" },
      { name: "second.pdf", id: "f2" },
    ]);
  });

  it("returns empty array for empty folder", async () => {
    mockDriveResponses({
      "empty": { files: [] },
    });

    const files = await listFilesInFolder(FAKE_KEY, "empty");
    expect(files).toEqual([]);
  });
});

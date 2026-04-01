import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeToSheet } from "./sheets";

const FAKE_KEY = JSON.stringify({
  client_email: "test@test.iam.gserviceaccount.com",
  private_key: "fake",
  token_uri: "https://oauth2.googleapis.com/token",
});

beforeEach(() => {
  vi.restoreAllMocks();
});

vi.mock("./google-auth", () => ({
  getAccessToken: vi.fn().mockResolvedValue("fake-token"),
}));

describe("writeToSheet", () => {
  it("clears A2:B then writes file data", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method || "GET",
          body: init.body as string | undefined,
        });
        return new Response(JSON.stringify({ updatedCells: 4 }));
      }),
    );

    const files = [
      { name: "doc.pdf", id: "abc123" },
      { name: "photo.jpg", id: "def456" },
    ];

    await writeToSheet(FAKE_KEY, "sheet-id-1", "files", files);

    expect(calls).toHaveLength(2);

    // First call: clear
    expect(calls[0].url).toContain("/sheet-id-1/values/files!A2:B:clear");
    expect(calls[0].method).toBe("POST");

    // Second call: write
    expect(calls[1].url).toContain("/sheet-id-1/values/files!A2");
    expect(calls[1].url).toContain("valueInputOption=RAW");
    expect(calls[1].method).toBe("PUT");

    const body = JSON.parse(calls[1].body!);
    expect(body.values).toEqual([
      ["doc.pdf", "abc123"],
      ["photo.jpg", "def456"],
    ]);
  });

  it("encodes sheet name with special characters", async () => {
    const calls: { url: string }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        calls.push({ url });
        return new Response(JSON.stringify({}));
      }),
    );

    await writeToSheet(FAKE_KEY, "sid", "Sheet 1", []);

    expect(calls[0].url).toContain("Sheet%201!A2");
  });

  it("throws on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response("", { status: 200 })) // clear succeeds
        .mockResolvedValueOnce(new Response("quota exceeded", { status: 429 })), // write fails
    );

    await expect(
      writeToSheet(FAKE_KEY, "sid", "files", [{ name: "a", id: "b" }]),
    ).rejects.toThrow("Sheets API write failed (429)");
  });
});

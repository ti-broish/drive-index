import { describe, it, expect, vi, beforeEach } from "vitest";

// Valid RSA test key (2048-bit, PKCS#8 PEM) — generated for tests only, not used anywhere
const TEST_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\n" +
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDI6khrE4Kh6vO5\n" +
  "Ss4Aq9Nf2v3jf7ijuOM7OJgnGJx6Tc5T9A9teIbkCIL/+mLU9KNO3LT1X+4QBCEp\n" +
  "tiZbFd9eZMDpJaWIkkGiNkjClGQBigCTvQ6uvul+YNADPRwxf4mwAiXu9YLBhiZM\n" +
  "ALz/GuZr6TpS5v7+wm1FXR+91PAziTxXXizSATmobcYddXOrnkZXLh2QOiASAH53\n" +
  "S5Gn1OFYTBuUnxV8w4kp2JcQMZlNvDl4Be4qtcYep7Cl6nV5bbiJ0JGvM/W9AJK8\n" +
  "rmNdOtY3/JejNc2DZrUJGCj1Wkby9hpnD+Q+Yj1aeKC6z2onxD78uO6jLdWqvNJK\n" +
  "r+BDHpklAgMBAAECggEABoHD76fVmr3bv9wC2PW3pkqW32fTCIZj4ZafIuECrFlZ\n" +
  "vdFRMJfvMnJuH7ExwzjbEyJFwA6nzJ/9nPa3vkpyjgGQV9yuxEIMWx8L8zVQGdao\n" +
  "1yAP2iv3ru6evgQcJiQ9xtQC+367Cd543gxGErMB1GvcxjOR/Zk5Zb4y2XiMgPa5\n" +
  "nP3GYM86PQFsMkg1ZpcU59K6D9GrxFn3EeJEc2FnnKnklK8ZqCPn+CNFbFrS8JCC\n" +
  "UoD0UlIFvsLV+WiFOMVJre1sjvb7QDhFV0S5NoNVG6r8vOWZioX7W8wooEv1PV5i\n" +
  "qMi0X5s1F/1PGGEODpqg9bXAaEdQluh4rFDopqXZDwKBgQD3iTywO2Du95OIUbq1\n" +
  "psiJfiekAPclpENS2o9JNv9EtmoSourzpf0rsLIDNlDfXu0y3JRozNyETVAopZZu\n" +
  "loEEZUNjqwPRNGu43Zt8rpnb2gFhH8sa5VoN9DVLoMVwSpYBLEksozrNmf3tg6/d\n" +
  "Jhr3g2TfCLIKkIpY8kTCWCpWBwKBgQDPyPU81aInzkM1z4pLVzch/ihw7ifUfkuQ\n" +
  "GcUbjhmy0Romi5VVu891SfZTP3bLA1GprHoLkz0OV6JXyYKwMPWyAY+23ViVCmsN\n" +
  "L+/OG+X0J9CWeXxf+6RWTD7HznM+WFV7NPFlIUPv8G87TcfAq3YSTaQiLJQsSgM+\n" +
  "kos0KflscwKBgGSLffcnZ0wpi+eHKwu13ybZ80gOjFThz+bLl//pMu66GYPQYRbu\n" +
  "iVNBxky/t0HD0R0js7SN4dRrgu+/ssbgoy8h4qmNQVOss0S33vxZ/2zptD27KEiY\n" +
  "eGfKlgtOFmRyJ1P6pQ5Yjv4MWrQrFTgCzllTKZneclMQOuG+Jme6YBfpAoGAZzWR\n" +
  "ouMWxaDtv4fUULIEn6zoF5gkTqdhDzXNs281Ep5M2AKTbd95H/BaG2W1swd2A8q5\n" +
  "YJCFTl93MxXUBYJ8OCwQX6u4uWdQX1+FRSKUaV9xe5zii6aqLXd347WHhttHsohM\n" +
  "s4f/f+o0xgdPhkNkxZitQ5BTFWC6FdWisYl77EMCgYEA02e27/Oo3Htxw7L5bVjB\n" +
  "s9T5IUx1tONRN9JHRcXMI3t9tJl8tIgdpx6X+w6rGSJzLgNfaxWFQw60kQA01qT7\n" +
  "VLMGGy2L76Bjp0DbkVljuKWdbFWUKL/sTTzZ/ktWi7diQ5Zz6Q+uElum6GUbwYXf\n" +
  "4F1hWwqL7pGbeTuDunyapXU=\n" +
  "-----END PRIVATE KEY-----\n";

const TEST_SERVICE_ACCOUNT_KEY = JSON.stringify({
  client_email: "test@test.iam.gserviceaccount.com",
  private_key: TEST_PRIVATE_KEY,
  token_uri: "https://oauth2.googleapis.com/token",
});

// Each test gets a fresh module to avoid shared token cache
async function freshGetAccessToken() {
  vi.resetModules();
  const mod = await import("./google-auth");
  return mod.getAccessToken;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getAccessToken", () => {
  it("exchanges JWT for access token with correct structure", async () => {
    const getAccessToken = await freshGetAccessToken();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "ya29.test-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const token = await getAccessToken(TEST_SERVICE_ACCOUNT_KEY);

    expect(token).toBe("ya29.test-token");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(options.method).toBe("POST");

    const body = new URLSearchParams(options.body);
    expect(body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );

    // Verify JWT structure (header.payload.signature)
    const jwt = body.get("assertion")!;
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    // Decode and verify header
    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    // Decode and verify payload
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.iss).toBe("test@test.iam.gserviceaccount.com");
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(payload.scope).toContain("drive.readonly");
    expect(payload.scope).toContain("spreadsheets");
  });

  it("caches token across calls", async () => {
    const getAccessToken = await freshGetAccessToken();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "ya29.cached-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const token1 = await getAccessToken(TEST_SERVICE_ACCOUNT_KEY);
    const token2 = await getAccessToken(TEST_SERVICE_ACCOUNT_KEY);

    expect(token1).toBe("ya29.cached-token");
    expect(token2).toBe("ya29.cached-token");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("throws on token exchange failure", async () => {
    const getAccessToken = await freshGetAccessToken();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 })),
    );

    await expect(getAccessToken(TEST_SERVICE_ACCOUNT_KEY)).rejects.toThrow(
      "Token exchange failed (400)",
    );
  });
});

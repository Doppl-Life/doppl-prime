import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createGitHubAgardenClient,
  createGitHubAppInstallationToken,
} from "../src/server/githubAgardenClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createGitHubAgardenClient", () => {
  it("reads base64 GitHub contents as text files", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://example.test/repos/Doppl-Life/agarden/contents/ratings-ledger.json?ref=main");
      return jsonResponse({
        path: "ratings-ledger.json",
        sha: "file-sha",
        encoding: "base64",
        content: Buffer.from("[]\n", "utf8").toString("base64"),
      });
    });
    const client = createGitHubAgardenClient({
      owner: "Doppl-Life",
      repo: "agarden",
      token: "server-token",
      apiBaseUrl: "https://example.test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.readTextFile("ratings-ledger.json")).resolves.toEqual({
      path: "ratings-ledger.json",
      sha: "file-sha",
      content: "[]\n",
    });
  });

  it("creates an atomic multi-file Git commit and updates the branch ref", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/contents/ratings-ledger.json")) {
        return jsonResponse({
          path: "ratings-ledger.json",
          sha: "ledger-sha",
          encoding: "base64",
          content: Buffer.from("[]\n", "utf8").toString("base64"),
        });
      }
      if (url.includes("/contents/flow/case/node.md")) {
        return jsonResponse({
          path: "flow/case/node.md",
          sha: "node-sha",
          encoding: "base64",
          content: Buffer.from("---\nid: node\n---\n# Node\n", "utf8").toString("base64"),
        });
      }
      if (url.endsWith("/git/ref/heads/main")) return jsonResponse({ object: { sha: "head-sha" } });
      if (url.endsWith("/git/commits/head-sha")) return jsonResponse({ sha: "head-sha", tree: { sha: "tree-sha" } });
      if (url.endsWith("/git/blobs")) return jsonResponse({ sha: `blob-${calls.filter((call) => call.url.endsWith("/git/blobs")).length}` });
      if (url.endsWith("/git/trees")) return jsonResponse({ sha: "new-tree-sha" });
      if (url.endsWith("/git/commits")) return jsonResponse({ sha: "new-commit-sha", tree: { sha: "new-tree-sha" } });
      if (url.endsWith("/git/refs/heads/main")) return jsonResponse({ object: { sha: "new-commit-sha" } });
      return jsonResponse({ message: "not found" }, 404);
    });
    const client = createGitHubAgardenClient({
      owner: "Doppl-Life",
      repo: "agarden",
      token: "server-token",
      apiBaseUrl: "https://example.test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.commitTextFiles({
        message: "judgment: rate node",
        files: [
          { path: "ratings-ledger.json", content: "ledger", previousSha: "ledger-sha" },
          { path: "flow/case/node.md", content: "node", previousSha: "node-sha" },
        ],
      }),
    ).resolves.toEqual({ commitSha: "new-commit-sha" });

    const methods = calls.map((call) => call.init?.method ?? "GET");
    expect(methods).toEqual(["GET", "GET", "GET", "GET", "POST", "POST", "POST", "POST", "PATCH"]);
    const treeRequest = calls.find((call) => call.url.endsWith("/git/trees"));
    expect(JSON.parse(String(treeRequest?.init?.body))).toMatchObject({
      base_tree: "tree-sha",
      tree: [
        { path: "ratings-ledger.json", sha: "blob-1" },
        { path: "flow/case/node.md", sha: "blob-2" },
      ],
    });
    const refRequest = calls.find((call) => call.url.endsWith("/git/refs/heads/main"));
    expect(JSON.parse(String(refRequest?.init?.body))).toEqual({ sha: "new-commit-sha", force: false });
  });

  it("rejects stale file SHAs before creating blobs", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/contents/ratings-ledger.json")) {
        return jsonResponse({
          path: "ratings-ledger.json",
          sha: "current-sha",
          encoding: "base64",
          content: Buffer.from("[]\n", "utf8").toString("base64"),
        });
      }
      return jsonResponse({ message: "not found" }, 404);
    });
    const client = createGitHubAgardenClient({
      owner: "Doppl-Life",
      repo: "agarden",
      token: "server-token",
      apiBaseUrl: "https://example.test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.commitTextFiles({
        message: "judgment: rate node",
        files: [{ path: "ratings-ledger.json", content: "ledger", previousSha: "old-sha" }],
      }),
    ).rejects.toMatchObject({ status: 409, code: "STALE_SHA" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createGitHubAppInstallationToken", () => {
  it("exchanges a GitHub App JWT for an installation token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String((init?.headers as Record<string, string>).authorization)).toMatch(/^Bearer /);
      return jsonResponse({ token: "installation-token" });
    });

    await expect(
      createGitHubAppInstallationToken({
        appId: "123",
        installationId: "456",
        privateKey,
        apiBaseUrl: "https://example.test",
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toBe("installation-token");
  });
});

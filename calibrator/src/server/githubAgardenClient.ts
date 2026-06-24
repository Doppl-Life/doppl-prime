import { createPrivateKey, createSign } from "node:crypto";
import type { GitAgardenClient, GitTextFileWrite } from "./githubAgardenWriter";

const DEFAULT_API_BASE = "https://api.github.com";

export interface GitHubAgardenClientConfig {
  owner: string;
  repo: string;
  branch?: string;
  token: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface GitHubAppConfig {
  appId: string;
  installationId: string;
  privateKey: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface GitHubContentResponse {
  path: string;
  sha: string;
  content?: string;
  encoding?: string;
}

interface GitHubRefResponse {
  object: {
    sha: string;
  };
}

interface GitHubCommitResponse {
  sha: string;
  tree: {
    sha: string;
  };
}

interface GitHubBlobResponse {
  sha: string;
}

interface GitHubTreeResponse {
  sha: string;
}

function encodeBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function decodeBase64(text: string): string {
  return Buffer.from(text.replace(/\n/g, ""), "base64").toString("utf8");
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : `GitHub request failed: ${response.status}`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

function createJwt(config: GitHubAppConfig, now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const expiresAt = issuedAt + 9 * 60;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: issuedAt,
    exp: expiresAt,
    iss: config.appId,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const key = createPrivateKey(config.privateKey.replace(/\\n/g, "\n"));
  const signature = signer.sign(key);
  return `${signingInput}.${base64Url(signature)}`;
}

export async function createGitHubAppInstallationToken(config: GitHubAppConfig): Promise<string> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE;
  const jwt = createJwt(config);
  const response = await fetchImpl(`${apiBaseUrl}/app/installations/${config.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${jwt}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  const body = await parseJson<{ token: string }>(response);
  return body.token;
}

export function createGitHubAgardenClient(config: GitHubAgardenClientConfig): GitAgardenClient {
  const branch = config.branch ?? "main";
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        ...init.headers,
      },
    });
    return parseJson<T>(response);
  }

  async function readTextFile(path: string) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const file = await request<GitHubContentResponse>(
      `/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    );
    if (file.encoding !== "base64" || !file.content) {
      throw new Error(`GitHub file ${path} is not base64 text content`);
    }
    return {
      path: file.path,
      content: decodeBase64(file.content),
      sha: file.sha,
    };
  }

  async function currentHead() {
    const ref = await request<GitHubRefResponse>(
      `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    const commit = await request<GitHubCommitResponse>(
      `/repos/${config.owner}/${config.repo}/git/commits/${ref.object.sha}`,
    );
    return {
      commitSha: ref.object.sha,
      treeSha: commit.tree.sha,
    };
  }

  async function assertCurrentShas(files: GitTextFileWrite[]) {
    const current = await Promise.all(files.map((file) => readTextFile(file.path)));
    for (const file of files) {
      const currentFile = current.find((item) => item.path === file.path);
      if (!currentFile || currentFile.sha !== file.previousSha) {
        const error = new Error(`stale sha for ${file.path}`) as Error & { status?: number; code?: string };
        error.status = 409;
        error.code = "STALE_SHA";
        throw error;
      }
    }
  }

  return {
    readTextFile,
    async commitTextFiles(input) {
      await assertCurrentShas(input.files);
      const head = await currentHead();
      const blobs = await Promise.all(
        input.files.map(async (file) => {
          const blob = await request<GitHubBlobResponse>(`/repos/${config.owner}/${config.repo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({
              content: encodeBase64(file.content),
              encoding: "base64",
            }),
          });
          return {
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          };
        }),
      );
      const tree = await request<GitHubTreeResponse>(`/repos/${config.owner}/${config.repo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: head.treeSha,
          tree: blobs,
        }),
      });
      const commit = await request<GitHubCommitResponse>(`/repos/${config.owner}/${config.repo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: input.message,
          tree: tree.sha,
          parents: [head.commitSha],
        }),
      });
      await request<GitHubRefResponse>(
        `/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(branch)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            sha: commit.sha,
            force: false,
          }),
        },
      );
      return { commitSha: commit.sha };
    },
  };
}

export async function createGitHubAgardenClientFromApp(
  config: Omit<GitHubAgardenClientConfig, "token"> & GitHubAppConfig,
): Promise<GitAgardenClient> {
  const token = await createGitHubAppInstallationToken(config);
  return createGitHubAgardenClient({ ...config, token });
}

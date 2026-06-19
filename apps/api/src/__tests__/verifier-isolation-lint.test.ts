import { globSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Phase 4 P4.4 single-chokepoint invariant lint. Scans every .ts file
 * under `apps/api/src/verifier/` and `apps/api/src/check-runners/` for
 * a `gateway.invoke(` substring. Only an allowlisted set of files is
 * permitted to call the gateway directly — and even there, the call
 * MUST use a request produced by U1's `assemble*Request` helpers (the
 * commit-time review enforces that part; this lint enforces the call
 * site set).
 *
 * Any new file under those trees calling `gateway.invoke(` is a
 * regression — either the call should route through U1's helpers
 * (preferred) or the file should be added to ALLOWED_GATEWAY_CALL_SITES
 * with an explanation in the PR.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "../../"); // apps/api/

const ALLOWED_GATEWAY_CALL_SITES: ReadonlySet<string> = new Set([
  "src/verifier/council/critic-call.ts",
  "src/verifier/judge/judge-call.ts",
]);

describe("spec(§7) verifier isolation lint", () => {
  test("only allowlisted files call gateway.invoke under verifier/ + check-runners/", () => {
    const files = globSync(["src/verifier/**/*.ts", "src/check-runners/**/*.ts"], {
      cwd: API_ROOT,
    }).filter((f: string) => !f.includes("/__tests__/") && !f.endsWith(".test.ts"));

    const violations: string[] = [];
    for (const f of files) {
      const abs = join(API_ROOT, f);
      const content = readFileSync(abs, "utf-8");
      // Match `gateway.invoke(` allowing any var name pattern.
      // Match common forms: foo.gateway.invoke(, deps.gateway.invoke(,
      // input.gateway.invoke(, gateway.invoke(.
      if (/\bgateway\.invoke\s*\(/.test(content)) {
        const rel = relative(API_ROOT, abs).split("\\").join("/");
        if (!ALLOWED_GATEWAY_CALL_SITES.has(rel)) {
          violations.push(rel);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("allowlisted files actually contain a gateway.invoke call (sanity-check the allowlist)", () => {
    for (const rel of ALLOWED_GATEWAY_CALL_SITES) {
      const abs = join(API_ROOT, rel);
      const content = readFileSync(abs, "utf-8");
      expect(content).toMatch(/\bgateway\.invoke\s*\(/);
    }
  });

  test("the only ModelGatewayRequest constructors in verifier/ live inside isolation/", () => {
    // Heuristic: a literal `role: "critic"` / `role: "final_judge"` /
    // `role: "subtype_check"` outside isolation/ would indicate someone
    // hand-rolled a request and bypassed the helpers. Tests are excluded.
    const files = globSync(["src/verifier/**/*.ts", "src/check-runners/**/*.ts"], {
      cwd: API_ROOT,
    }).filter(
      (f: string) =>
        !f.includes("/__tests__/") && !f.endsWith(".test.ts") && !f.includes("/isolation/"),
    );

    const violations: string[] = [];
    for (const f of files) {
      const abs = join(API_ROOT, f);
      const content = readFileSync(abs, "utf-8");
      if (/role:\s*"critic"|role:\s*"final_judge"|role:\s*"subtype_check"/.test(content)) {
        const rel = relative(API_ROOT, abs).split("\\").join("/");
        // Allow the U3 critic-call.ts and U6 judge-call.ts files that
        // legitimately pass the role through to pipeStructuredOutput
        // ctx.role — those are STRING role tags, not request
        // constructions.
        const allowedAsCtxRole = new Set([
          "src/verifier/council/critic-call.ts",
          "src/verifier/judge/judge-call.ts",
        ]);
        if (!allowedAsCtxRole.has(rel)) {
          violations.push(rel);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

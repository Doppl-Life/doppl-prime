import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { RecordedFixtureNotFoundError } from "./errors.js";
import type { ModelGateway } from "./gateway.js";

/**
 * In-memory fixture-replay implementation of `ModelGateway`. Lets the
 * verifier / selection / demo tracks fork against deterministic
 * responses without provider keys (per IMPLEMENTATION_PLAN.md P2.9).
 *
 * Lookup: `<fixtureDir>/<adapter>/<role>/<key>.json`. Default key is
 * `default`; callers may also pass an explicit `keyFor(request)`
 * function to derive an input-specific key (e.g., an inputHash).
 *
 * Missing fixture → `RecordedFixtureNotFoundError` with the resolved
 * path. Stale fixtures are caught by `pnpm test:live` against the real
 * APIs (the live tier is the corrective).
 */

export interface RecordedGatewayOptions {
  fixtureDir: string;
  adapter: string;
  keyFor?: (request: ModelGatewayRequest) => string;
}

export class RecordedGateway implements ModelGateway {
  private readonly fixtureDir: string;
  private readonly adapter: string;
  private readonly keyFor: (request: ModelGatewayRequest) => string;

  constructor(options: RecordedGatewayOptions) {
    this.fixtureDir = options.fixtureDir;
    this.adapter = options.adapter;
    this.keyFor = options.keyFor ?? (() => "default");
  }

  async invoke(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
    const key = this.keyFor(request);
    const fixturePath = path.join(this.fixtureDir, this.adapter, request.role, `${key}.json`);
    if (!existsSync(fixturePath)) {
      throw new RecordedFixtureNotFoundError(fixturePath);
    }
    const raw = readFileSync(fixturePath, "utf8");
    return JSON.parse(raw) as ModelGatewayResponse;
  }
}

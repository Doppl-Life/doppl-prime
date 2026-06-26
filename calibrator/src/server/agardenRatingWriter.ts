import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { isAllowedRater, normalizeRaterEmail } from "../raters";

const AgardenLedgerRating = z.object({
  rater_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  rate_date: z.string().min(1),
});

const AgardenLedgerEntry = z.object({
  node_id: z.string().min(1),
  ratings: z.array(AgardenLedgerRating).default([]),
});

const AgardenRatingsLedger = z.array(AgardenLedgerEntry);

export type AgardenLedgerRating = z.infer<typeof AgardenLedgerRating>;
export type AgardenLedgerEntry = z.infer<typeof AgardenLedgerEntry>;

export interface UpsertAgardenRatingInput {
  agardenRoot: string;
  nodeId: string;
  raterId: string;
  score: number;
  now?: Date;
  ledgerPath?: string;
}

export interface UpsertAgardenRatingResult {
  ledgerAbsolutePath: string;
  ledgerRelativePath: string;
  entry: AgardenLedgerEntry;
  projection: {
    human: number | null;
    n: number;
  };
}

async function readLedger(path: string): Promise<AgardenLedgerEntry[]> {
  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) return [];
    return AgardenRatingsLedger.parse(JSON.parse(raw));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
}

function projectionFor(entry: AgardenLedgerEntry): UpsertAgardenRatingResult["projection"] {
  const n = entry.ratings.length;
  if (n === 0) return { human: null, n };
  const sum = entry.ratings.reduce((total, rating) => total + rating.score, 0);
  return { human: Number((sum / n).toFixed(2)), n };
}

export async function upsertAgardenRating(input: UpsertAgardenRatingInput): Promise<UpsertAgardenRatingResult> {
  if (!input.nodeId.trim()) throw new Error("node_id is required");
  if (!Number.isInteger(input.score) || input.score < -5 || input.score > 5) {
    throw new Error("score must be an integer from -5 to 5");
  }

  const raterId = normalizeRaterEmail(input.raterId);
  if (!isAllowedRater(raterId)) throw new Error("rater_id must be a valid email address");

  const now = input.now ?? new Date();
  const ledgerAbsolutePath = input.ledgerPath ?? join(input.agardenRoot, "ratings-ledger.json");
  const ledger = await readLedger(ledgerAbsolutePath);
  let entry = ledger.find((item) => item.node_id === input.nodeId);
  if (!entry) {
    entry = { node_id: input.nodeId, ratings: [] };
    ledger.push(entry);
  }

  const nextRating: AgardenLedgerRating = {
    rater_id: raterId,
    score: input.score,
    rate_date: now.toISOString(),
  };
  const existingIndex = entry.ratings.findIndex((rating) => normalizeRaterEmail(rating.rater_id) === raterId);
  if (existingIndex >= 0) {
    entry.ratings[existingIndex] = nextRating;
  } else {
    entry.ratings.push(nextRating);
  }

  await mkdir(dirname(ledgerAbsolutePath), { recursive: true });
  await writeFile(ledgerAbsolutePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  return {
    ledgerAbsolutePath,
    ledgerRelativePath: relative(input.agardenRoot, ledgerAbsolutePath),
    entry,
    projection: projectionFor(entry),
  };
}

import { z } from "zod";
import { Agenome } from "../../domain/agenome.js";
import { ReproductionEvent } from "../../reproduction/reproduction-event.js";

export const AgenomeSpawnedPayload = z.object({ agenome: Agenome }).strict();

export const AgenomeFusedPayload = z.object({ reproduction: ReproductionEvent }).strict();

export const AgenomeMutatedPayload = z.object({ reproduction: ReproductionEvent }).strict();

export const AgenomeReproducedPayload = z.object({ reproduction: ReproductionEvent }).strict();

import { z } from "zod";
import { EnergyEvent } from "../../reproduction/energy-event.js";

export const EnergySpentPayload = z.object({ energy: EnergyEvent }).strict();

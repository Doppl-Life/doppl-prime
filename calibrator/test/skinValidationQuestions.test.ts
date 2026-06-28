import { describe, expect, it } from "vitest";
import { skinValidationQuestion } from "../src/skinValidationQuestions";

describe("skinValidationQuestion", () => {
  it("returns Jack drone privacy validation questions for normalized Skin in the Game entries", () => {
    expect(
      skinValidationQuestion(
        "behavioral-camouflage-protocol-b-cap-1477a1ac",
        "Luxury Hospitality Operations",
      ),
    ).toContain("guests interpreting it as a security alarm");

    expect(
      skinValidationQuestion(
        "the-operational-misdirection-geo-fencing-the-scandal-db8f130f",
        "High-frequency operational agility training (crew)",
      ),
    ).toContain("without guests noticing a security maneuver");

    expect(
      skinValidationQuestion(
        "the-asset-is-the-photograph-not-the-drone-9b2e71c4",
        "Run the cheapest falsifying check first — measure detection range and drone closing speed against the time it takes exposed people to clear sightlines.",
      ),
    ).toContain("showing people cannot clear sightlines fast enough");
  });
});

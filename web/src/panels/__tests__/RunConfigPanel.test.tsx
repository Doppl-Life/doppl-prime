import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, type vi } from "vitest";
import { makeStubClient, renderWithStore } from "../../test-utils/render.js";
import { RunConfigPanel } from "../RunConfigPanel.js";
import { DEFAULT_FORM_STATE, MAX_CAPS, formToConfig } from "../runConfigForm.js";

describe("formToConfig", () => {
  test("default form parses to a valid RunConfig", () => {
    const out = formToConfig(DEFAULT_FORM_STATE);
    expect(out.ok).toBe(true);
  });

  test("cap above MAX_CAPS.maxPopulation surfaces an error", () => {
    const out = formToConfig({
      ...DEFAULT_FORM_STATE,
      caps: { ...DEFAULT_FORM_STATE.caps, maxPopulation: MAX_CAPS.maxPopulation + 1 },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some((e) => e.path.join(".") === "caps.maxPopulation")).toBe(true);
  });

  test("disabling all subtypes surfaces an error", () => {
    const out = formToConfig({
      ...DEFAULT_FORM_STATE,
      enabledSubtypes: { cross_domain_transfer: false, zeitgeist_synthesis: false },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some((e) => e.path.includes("enabledSubtypes"))).toBe(true);
  });
});

describe("RunConfigPanel", () => {
  test("default submit invokes startRun with a fresh idempotency key", async () => {
    const client = makeStubClient();
    renderWithStore(<RunConfigPanel idempotencyKeyFactory={() => "test-key"} />, { client });
    fireEvent.submit(screen.getByLabelText("Run configuration"));
    await waitFor(() => {
      expect(client.startRun).toHaveBeenCalled();
    });
    const call = (client.startRun as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[1]?.idempotencyKey).toBe("test-key");
  });

  test("cap-max violation blocks submit + renders inline error", async () => {
    const client = makeStubClient();
    renderWithStore(<RunConfigPanel idempotencyKeyFactory={() => "test-key"} />, { client });
    // Set max population beyond ceiling
    const popInput = screen.getByLabelText("Max population") as HTMLInputElement;
    fireEvent.change(popInput, { target: { value: String(MAX_CAPS.maxPopulation + 5) } });
    fireEvent.submit(screen.getByLabelText("Run configuration"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(client.startRun).not.toHaveBeenCalled();
  });
});

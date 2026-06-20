import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { makeStubClient, renderWithStore } from "../../test-utils/render.js";
import { StopControl } from "../StopControl.js";

describe("StopControl", () => {
  test("renders nothing when no runId is set", () => {
    const { container } = renderWithStore(<StopControl />);
    expect(container.firstChild).toBeNull();
  });

  test("non-terminal run shows enabled 'Stop run' button", () => {
    renderWithStore(<StopControl />, {
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        run: { id: "run_x", status: "running" },
      },
    });
    const btn = screen.getByRole("button", { name: /stop run/i });
    expect(btn).toBeEnabled();
  });

  test("terminal run shows disabled button labeled with terminal status", () => {
    renderWithStore(<StopControl />, {
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        run: { id: "run_x", status: "completed" },
      },
    });
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/Run completed/i);
  });

  test("click invokes stopRun once", async () => {
    const client = makeStubClient();
    renderWithStore(<StopControl />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_y",
        run: { id: "run_y", status: "running" },
      },
    });
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(client.stopRun).toHaveBeenCalledWith("run_y");
    });
  });

  test("network error surfaces inline", async () => {
    const client = makeStubClient({
      stopRun: async () => {
        throw new Error("boom");
      },
    });
    renderWithStore(<StopControl />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_z",
        run: { id: "run_z", status: "running" },
      },
    });
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
  });
});

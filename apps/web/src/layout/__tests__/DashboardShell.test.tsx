import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { renderWithStore } from "../../test-utils/render.js";
import { DashboardShell } from "../DashboardShell.js";

// React Flow + Recharts both need ResizeObserver
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver?: typeof StubResizeObserver }).ResizeObserver =
  StubResizeObserver;

describe("DashboardShell", () => {
  test("renders Doppl header + mode indicator", () => {
    renderWithStore(<DashboardShell />);
    expect(screen.getByText("Doppl")).toBeInTheDocument();
    expect(screen.getByText(/IDLE/)).toBeInTheDocument();
  });

  test("setup phase: renders left + main sections, named panels, and activity drawer", () => {
    const { container } = renderWithStore(<DashboardShell />);
    expect(container.querySelector('[data-rail="left"]')).not.toBeNull();
    expect(container.querySelector('[data-rail="main"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="lineage"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="fitness"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="generations"]')).not.toBeNull();
    // Activity is its own view tab now (not inline).
    expect(screen.getByRole("tab", { name: /^activity/i })).toBeInTheDocument();
    // Inspector is selection-driven; nothing selected → not rendered.
    expect(container.querySelector('[data-rail="inspector"]')).toBeNull();
  });

  test("Activity tab switches the main view to the flat event table", () => {
    const { container } = renderWithStore(<DashboardShell />);
    // Dashboard view first: lineage panel present.
    expect(container.querySelector('[data-panel="lineage"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^activity/i }));
    // Now the Agent activity section is shown and the dashboard panels are not.
    expect(screen.getByRole("region", { name: /agent activity/i })).toBeInTheDocument();
    expect(container.querySelector('[data-panel="lineage"]')).toBeNull();
  });

  test("sidebar brand block shows 'no run loaded' when no run is set", () => {
    const { container } = renderWithStore(<DashboardShell />);
    expect(container.querySelector("[data-brand]")).toHaveTextContent(/no run loaded/i);
  });
});

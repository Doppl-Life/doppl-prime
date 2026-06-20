import { screen } from "@testing-library/react";
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

  test("renders all three rails + all named panels", () => {
    const { container } = renderWithStore(<DashboardShell />);
    expect(container.querySelector('[data-rail="left"]')).not.toBeNull();
    expect(container.querySelector('[data-rail="main"]')).not.toBeNull();
    expect(container.querySelector('[data-rail="right"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="lineage"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="fitness"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="generations"]')).not.toBeNull();
  });

  test("header shows 'no run loaded' when no run is set", () => {
    const { container } = renderWithStore(<DashboardShell />);
    expect(container.querySelector("header")).toHaveTextContent(/no run loaded/i);
  });
});

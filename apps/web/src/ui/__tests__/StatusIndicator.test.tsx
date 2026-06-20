import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatusIndicator } from "../StatusIndicator.js";

describe("StatusIndicator", () => {
  test("renders aria-label from the token", () => {
    render(<StatusIndicator domain="check" status="passed" />);
    const node = screen.getByRole("status");
    expect(node).toHaveAttribute("aria-label", "check passed");
  });

  test("renders the label text by default", () => {
    render(<StatusIndicator domain="check" status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  test("hides the label when showLabel=false", () => {
    render(<StatusIndicator domain="check" status="passed" showLabel={false} />);
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
  });

  test("unknown status renders the neutral indicator with 'Unknown' label", () => {
    render(<StatusIndicator domain="candidate" status="weird" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "unknown status");
  });

  test("data-status attribute reflects the raw status value", () => {
    render(<StatusIndicator domain="agenome" status="active" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-status", "active");
  });

  test("renders an SVG shape (programmatically determinable)", () => {
    const { container } = render(<StatusIndicator domain="run" status="running" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  test("size=lg renders a larger SVG", () => {
    const { container: sm } = render(<StatusIndicator domain="run" status="running" size="sm" />);
    const { container: lg } = render(<StatusIndicator domain="run" status="running" size="lg" />);
    const smSvg = sm.querySelector("svg");
    const lgSvg = lg.querySelector("svg");
    const smSize = Number.parseInt(smSvg?.getAttribute("width") ?? "0", 10);
    const lgSize = Number.parseInt(lgSvg?.getAttribute("width") ?? "0", 10);
    expect(lgSize).toBeGreaterThan(smSize);
  });
});

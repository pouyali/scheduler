import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the label", () => {
    render(<StatusBadge variant="archived">Archived</StatusBadge>);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
  it("applies the not-geocoded variant class", () => {
    const { container } = render(
      <StatusBadge variant="not-geocoded">No location</StatusBadge>,
    );
    expect(container.firstChild).toHaveClass("italic");
  });
  it("applies the archived variant class", () => {
    const { container } = render(<StatusBadge variant="archived">Archived</StatusBadge>);
    expect(container.firstChild).toHaveClass("border");
  });
  it("applies the active variant class", () => {
    const { container } = render(<StatusBadge variant="active">Active</StatusBadge>);
    expect(container.firstChild).toHaveClass("bg-muted");
  });
});

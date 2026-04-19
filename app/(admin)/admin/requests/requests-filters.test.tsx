import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestsFilters } from "./requests-filters";

describe("RequestsFilters", () => {
  test("renders status tabs and marks the current one active", () => {
    render(<RequestsFilters currentStatus="open" />);
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /notified/i })).not.toHaveAttribute("aria-current");
  });
});

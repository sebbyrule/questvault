import { describe, it, expect } from "vitest";
import { isAdminRole } from "./roles";

describe("isAdminRole", () => {
  it("is true for admin and owner", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("owner")).toBe(true);
  });

  it("is false for member, viewer, and absent roles", () => {
    expect(isAdminRole("member")).toBe(false);
    expect(isAdminRole("viewer")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
});

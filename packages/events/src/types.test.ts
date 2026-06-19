import { describe, it, expect } from "vitest";
import { makeEvent, EVENT_TYPES } from "./types";

describe("makeEvent", () => {
  it("stamps a unique id and ISO timestamp, preserving type/payload/actor", () => {
    const a = makeEvent("ticket.created", { id: "t1" }, "u1");
    const b = makeEvent("ticket.created", { id: "t1" }, "u1");

    expect(a.type).toBe("ticket.created");
    expect(a.payload).toEqual({ id: "t1" });
    expect(a.actorId).toBe("u1");
    expect(a.eventId).not.toBe(b.eventId); // fresh id each call
    expect(() => new Date(a.timestamp).toISOString()).not.toThrow();
    expect(new Date(a.timestamp).toISOString()).toBe(a.timestamp);
  });

  it("allows a null actor (system-originated events)", () => {
    expect(makeEvent("ticket.closed", {}, null).actorId).toBeNull();
  });

  it("exposes the documented event catalog", () => {
    expect(EVENT_TYPES).toContain("ticket.created");
    expect(EVENT_TYPES).toContain("pr.linked");
  });
});

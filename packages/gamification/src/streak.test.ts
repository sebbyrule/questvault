import { describe, it, expect } from "vitest";
import { utcDayNumber, utcMidnight, storedAction, nextStreak } from "./streak";

describe("utcDayNumber / utcMidnight", () => {
  it("assigns the same day index across one UTC day and increments at midnight", () => {
    const morning = new Date("2026-06-13T00:00:00.000Z");
    const night = new Date("2026-06-13T23:59:59.999Z");
    const nextDay = new Date("2026-06-14T00:00:00.000Z");
    expect(utcDayNumber(morning)).toBe(utcDayNumber(night));
    expect(utcDayNumber(nextDay)).toBe(utcDayNumber(morning) + 1);
  });

  it("utcMidnight floors to 00:00:00 UTC of the same day", () => {
    const d = new Date("2026-06-13T15:42:10.500Z");
    expect(utcMidnight(d).toISOString()).toBe("2026-06-13T00:00:00.000Z");
  });
});

describe("storedAction", () => {
  it("splits ticket_closed by priority", () => {
    expect(storedAction("ticket_closed", "p0")).toBe("ticket_closed_p0_p1");
    expect(storedAction("ticket_closed", "p1")).toBe("ticket_closed_p0_p1");
    expect(storedAction("ticket_closed", "p2")).toBe("ticket_closed_p2_p3");
    expect(storedAction("ticket_closed", "p3")).toBe("ticket_closed_p2_p3");
    expect(storedAction("ticket_closed", undefined)).toBe("ticket_closed_p2_p3");
  });

  it("passes other actions through unchanged", () => {
    expect(storedAction("ticket_created")).toBe("ticket_created");
    expect(storedAction("pr_linked")).toBe("pr_linked");
  });
});

describe("nextStreak", () => {
  const today = new Date("2026-06-13T12:00:00.000Z");
  const yesterday = new Date("2026-06-12T08:00:00.000Z");
  const earlierToday = new Date("2026-06-13T01:00:00.000Z");
  const lastWeek = new Date("2026-06-06T12:00:00.000Z");

  it("starts a streak at 1 when there is no prior activity", () => {
    expect(nextStreak(0, null, today)).toBe(1);
  });

  it("extends the streak on a consecutive day", () => {
    expect(nextStreak(5, yesterday, today)).toBe(6);
  });

  it("leaves the streak unchanged for a second action the same UTC day", () => {
    expect(nextStreak(5, earlierToday, today)).toBe(5);
  });

  it("resets to 1 after a gap of more than one day", () => {
    expect(nextStreak(5, lastWeek, today)).toBe(1);
  });
});

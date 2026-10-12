import { describe, expect, it } from "vitest";
import { localMidnightUtc, parseIsoDate, todayIn } from "./dates";

describe("dates", () => {
  it("finds the UTC instant of local midnight", () => {
    const d = parseIsoDate("2026-10-12")!;
    expect(localMidnightUtc(d, "Asia/Seoul").toISOString()).toBe("2026-10-11T15:00:00.000Z");
    expect(localMidnightUtc(d, "Asia/Tokyo").toISOString()).toBe("2026-10-11T15:00:00.000Z");
    expect(localMidnightUtc(d, "UTC").toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(localMidnightUtc(parseIsoDate("2026-07-01")!, "America/New_York").toISOString()).toBe(
      "2026-07-01T04:00:00.000Z",
    );
  });

  it("knows today's local date", () => {
    expect(todayIn("Asia/Seoul", new Date("2026-10-11T16:00:00Z")).toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });
});

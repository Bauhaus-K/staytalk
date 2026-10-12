import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("cron: expire-bookings", () => {
  it("rejects requests without the cron secret", async () => {
    expect((await GET(new Request("http://x/api/cron/expire-bookings"))).status).toBe(401);
    const wrong = new Request("http://x/api/cron/expire-bookings", {
      headers: { authorization: "Bearer nope" },
    });
    expect((await GET(wrong)).status).toBe(401);
  });
});

import { describe, expect, it } from "vitest";
import { GET } from "./route";

const ctx = (job: string) => ({ params: Promise.resolve({ job }) });

describe("cron route", () => {
  it("rejects requests without the cron secret", async () => {
    const url = "http://x/api/cron/expire-bookings";
    expect((await GET(new Request(url), ctx("expire-bookings"))).status).toBe(401);
    const wrong = new Request(url, { headers: { authorization: "Bearer nope" } });
    expect((await GET(wrong, ctx("expire-bookings"))).status).toBe(401);
  });

  it("404s unknown jobs", async () => {
    const request = new Request("http://x/api/cron/nope", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect((await GET(request, ctx("nope"))).status).toBe(404);
  });
});

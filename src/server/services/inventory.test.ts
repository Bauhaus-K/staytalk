import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { parseInventoryCsv } from "./inventory";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
});

describe("parseInventoryCsv", () => {
  const roomTypes = [
    { id: "rt_double", name: { ko: "한옥 더블룸", en: "Hanok Double Room" }, totalRooms: 3 },
    { id: "rt_family", name: { ko: "패밀리룸" }, totalRooms: 1 },
  ];

  it("parses rows by id or localized name and reports per-line errors", () => {
    const csv = [
      "date,room_type,available,rate,closed",
      "2026-11-01,rt_double,2,120000,",
      '2026-11-02,한옥 더블룸,,"130,000",no',
      "2026-11-03,패밀리룸,,,yes",
      "2026-11-31,rt_double,1,,",
      "2026-11-04,suite,1,,",
      "2026-11-05,rt_family,2,,",
      "2026-11-06,rt_double,-1,abc,maybe",
    ].join("\n");
    const { rows, errors } = parseInventoryCsv(csv, roomTypes);
    expect(rows).toEqual([
      {
        line: 2,
        roomTypeId: "rt_double",
        date: "2026-11-01",
        availableCount: 2,
        rate: 120000,
        closed: false,
      },
      {
        line: 3,
        roomTypeId: "rt_double",
        date: "2026-11-02",
        availableCount: null,
        rate: 130000,
        closed: false,
      },
      {
        line: 4,
        roomTypeId: "rt_family",
        date: "2026-11-03",
        availableCount: null,
        rate: null,
        closed: true,
      },
    ]);
    expect(errors).toEqual([
      { line: 5, code: "invalid_date", value: "2026-11-31" },
      { line: 6, code: "unknown_room_type", value: "suite" },
      { line: 7, code: "available_exceeds_total", value: "2" },
      { line: 8, code: "invalid_available", value: "-1" },
      { line: 8, code: "invalid_rate", value: "abc" },
      { line: 8, code: "invalid_closed", value: "maybe" },
    ]);
  });

  it("requires the header", () => {
    expect(parseInventoryCsv("2026-11-01,rt_double", roomTypes).errors).toEqual([
      { line: 1, code: "missing_header" },
    ]);
  });
});

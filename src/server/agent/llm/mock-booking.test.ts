import { describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { contactIn, guestsIn, nameIn, pickRoom, roomsFromSystem, stayIn } from "./mock-booking";

const today = parseIsoDate("2026-10-12")!;

describe("mock booking parsing", () => {
  it.each([
    ["Do you have a double room for 2 people from November 20 to 22?", "2026-11-20", "2026-11-22"],
    ["12월 5일부터 2박, 2명 더블룸 예약 가능할까요?", "2026-12-05", "2026-12-07"],
    ["11月25日入住两晚，两个人，有空房吗？", "2026-11-25", "2026-11-27"],
    ["Do you have a room for 2 adults on December 10, one night?", "2026-12-10", "2026-12-11"],
    ["2026-11-01 to 2026-11-03", "2026-11-01", "2026-11-03"],
    ["3/2 one night", "2027-03-02", "2027-03-03"],
  ])("%s", (text, checkIn, checkOut) => {
    expect(stayIn([text], today)).toEqual({ checkIn, checkOut });
  });

  it("reads party size, name and contact", () => {
    expect(guestsIn("2명")).toBe(2);
    expect(guestsIn("两个人")).toBe(2);
    expect(guestsIn("for 3 adults")).toBe(3);
    expect(nameIn("My name is Alex Kim, email alex@example.com.")).toBe("Alex Kim");
    expect(contactIn("My name is Alex Kim, email alex@example.com.")).toBe("alex@example.com");
    expect(contactIn("010-1234-5678")).toBe("010-1234-5678");
  });

  it("picks the room the guest named", () => {
    const system = [
      '<room_type id="r6" capacity="2">ja: 和室6畳 / en: Japanese Room (6 tatami) — x</room_type>',
      '<room_type id="r10" capacity="4">ja: 和室10畳 / en: Japanese Room (10 tatami) — y</room_type>',
    ].join("\n");
    const rooms = roomsFromSystem(system);
    expect(rooms.map((r) => r.id)).toEqual(["r6", "r10"]);
    expect(pickRoom(rooms, "please book the 6-tatami room", 2)?.id).toBe("r6");
    expect(pickRoom(rooms, "the 10 tatami one", 2)?.id).toBe("r10");
    expect(pickRoom(rooms, "any room", 3)?.id).toBe("r10");
  });
});

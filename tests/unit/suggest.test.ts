import { describe, expect, it } from "vitest";
import { suggestRooms } from "@/lib/suggest";
import type { Floor, Room, SeatingType } from "@/lib/types";

const mk = (id: string, floor: Floor, cap: number | null, seating: SeatingType = "의자", active = true, sort = 0): Room => ({
  id, floor, name: id, capacity_text: cap === null ? "" : `${cap}명`, capacity_num: cap, seating_type: seating, note: "",
  sort_order: sort, is_active: active, created_at: "", updated_at: "",
});

const sion = mk("sion", "B1", 40);
const nuri = mk("nuri", "1F", 50, "바닥");
const gippeum = mk("gippeum", "2F", 50);
const somang = mk("somang", "3F", 200);
const mideum = mk("mideum", "3F", 50);
const lausanne = mk("lausanne", "3F", 20);
const hidden = mk("hidden", "3F", 50, "의자", false);
const ROOMS = [sion, nuri, gippeum, somang, mideum, lausanne, hidden];
const ids = (rs: Room[]) => rs.map((r) => r.id);

describe("빈 장소 추천", () => {
  it("원래 장소·예약 있는 장소·숨긴 장소는 빠진다", () => {
    const out = suggestRooms(ROOMS, new Set(["gippeum"]), { current: mideum, attendees: null, limit: 10 });
    expect(ids(out)).not.toContain("mideum");
    expect(ids(out)).not.toContain("gippeum");
    expect(ids(out)).not.toContain("hidden");
  });

  it("인원이 들어가는 방 → 같은 좌석 형태 → 같은 층 → 비슷한 크기 순", () => {
    const out = suggestRooms(ROOMS, new Set(), { current: mideum, attendees: 45, limit: 10 });
    // 45명이 안 들어가는 방은 맨 뒤 (그중에서도 같은 층인 로잔홀이 먼저)
    expect(ids(out).slice(-2)).toEqual(["lausanne", "sion"]);
    // 들어가는 방 중: 같은 좌석(의자)이 바닥(누리홀)보다 먼저, 같은 층(소망홀)이 다른 층(기쁨홀)보다 먼저
    expect(ids(out).slice(0, 3)).toEqual(["somang", "gippeum", "nuri"]);
  });

  it("인원을 모르면 원래 방 크기와 비슷한 방을 먼저", () => {
    const out = suggestRooms([sion, somang, lausanne], new Set(), { current: mk("x", "B1", 30), attendees: null });
    expect(ids(out)).toEqual(["sion", "lausanne", "somang"]);
  });

  it("limit 개수만큼만", () => {
    expect(suggestRooms(ROOMS, new Set(), { current: null, attendees: null, limit: 2 })).toHaveLength(2);
  });
});

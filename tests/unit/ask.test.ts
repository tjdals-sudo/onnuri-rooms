import { describe, expect, it } from "vitest";
import { answerQuestion, parseQuestion, roomAliases } from "@/lib/ask";
import { seoulToUtc } from "@/lib/time";
import type { Floor, PublicReservation, Room } from "@/lib/types";

const mk = (id: string, floor: Floor, name: string, cap: number): Room => ({
  id, floor, name, capacity_text: `${cap}명`, capacity_num: cap, seating_type: "의자", note: "",
  sort_order: 0, is_active: true, created_at: "", updated_at: "",
});
const ROOMS = [
  mk("sion", "B1", "시온홀", 40),
  mk("nuri", "1F", "누리홀", 50),
  mk("band", "2F", "밴드 연습실", 15),
  mk("somang", "3F", "소망홀", 200),
  mk("lausanne", "3F", "로잔홀", 20),
  mk("o1", "4F", "오병이어1(왼쪽)", 20),
  mk("o2", "4F", "오병이어2(오른쪽)", 20),
  mk("r401", "4F", "401·402호", 30),
];
// 2026-10-16 (금) 10:00 KST
const NOW = seoulToUtc("2026-10-16", "10:00");
const ask = (q: string) => parseQuestion(q, ROOMS, NOW);
const H = (h: number, m = 0) => h * 60 + m;

describe("물어보기 — 질문 해석", () => {
  it("월/일 + 오후 시각 + 장소", () => {
    const p = ask("10월 20일 오후 3시 소망홀 비었어?");
    expect(p).toMatchObject({ dateKeys: ["2026-10-20"], mode: "point", fromMin: H(15), roomIds: ["somang"] });
  });

  it("오전/오후 없으면 1~7시는 오후, 8~11시는 오전", () => {
    expect(ask("내일 3시").fromMin).toBe(H(15));
    expect(ask("내일 10시").fromMin).toBe(H(10));
    expect(ask("내일 7시 반").fromMin).toBe(H(19, 30));
  });

  it("시간 구간 — 뒤쪽은 앞쪽의 오후를 따라간다", () => {
    expect(ask("오후 2시~4시")).toMatchObject({ fromMin: H(14), toMin: H(16), mode: "range" });
    expect(ask("10시부터 1시까지")).toMatchObject({ fromMin: H(10), toMin: H(13) });
    expect(ask("14:00-15:30")).toMatchObject({ fromMin: H(14), toMin: H(15, 30) });
    expect(ask("3시부터 2시간")).toMatchObject({ fromMin: H(15), toMin: H(17), mode: "range" });
  });

  it("상대 날짜·요일", () => {
    expect(ask("내일").dateKeys).toEqual(["2026-10-17"]);
    expect(ask("모레 저녁").dateKeys).toEqual(["2026-10-18"]);
    expect(ask("다음주 화요일").dateKeys).toEqual(["2026-10-20"]);
    expect(ask("다음 주 토 오전").dateKeys).toEqual(["2026-10-24"]);
    expect(ask("수요일").dateKeys).toEqual(["2026-10-21"]); // 이미 지난 요일 → 다음 주
    expect(ask("금요일").dateKeys).toEqual(["2026-10-16"]); // 오늘 포함
    expect(ask("이번 주일 오후").dateKeys).toEqual(["2026-10-18"]);
    expect(ask("이번 주말").dateKeys).toEqual(["2026-10-17", "2026-10-18"]);
  });

  it("연도 없는 지난 날짜는 내년, 일만 말하면 이번 달/다음 달", () => {
    expect(ask("1월 5일").dateKeys).toEqual(["2027-01-05"]);
    expect(ask("20일").dateKeys).toEqual(["2026-10-20"]);
    expect(ask("3일").dateKeys).toEqual(["2026-11-03"]);
    expect(ask("10/25 오전").dateKeys).toEqual(["2026-10-25"]);
  });

  it("때만 말하면 그 범위", () => {
    expect(ask("내일 오전 빈 방")).toMatchObject({ fromMin: H(9), toMin: H(12), mode: "range" });
    expect(ask("내일 저녁")).toMatchObject({ fromMin: H(18), toMin: H(22) });
  });

  it("날짜 없으면 오늘, 시간 없으면 하루", () => {
    expect(ask("소망홀 비었어?")).toMatchObject({ dateKeys: ["2026-10-16"], dateAssumed: true, mode: "day" });
  });

  it("장소 별칭 — 띄어쓰기, 홀 생략, 밴드실, 오병이어, 401호", () => {
    expect(ask("소망 홀").roomIds).toEqual(["somang"]);
    expect(ask("로잔 3시").roomIds).toEqual(["lausanne"]);
    expect(ask("밴드실 내일").roomIds).toEqual(["band"]);
    expect(ask("오병이어 내일").roomIds?.sort()).toEqual(["o1", "o2"]);
    expect(ask("오병이어1 3시").roomIds).toEqual(["o1"]);
    expect(ask("오병이어1 3시").fromMin).toBe(H(15));
    expect(ask("401호 내일").roomIds).toEqual(["r401"]);
    expect(roomAliases("소망홀")).toContain("소망");
  });

  it("'온누리'의 누리는 누리홀이 아니다", () => {
    expect(ask("온누리교회 내일 빈 곳").roomIds).toBeNull();
  });

  it("층·인원 조건", () => {
    expect(ask("3층 내일 2시").floor).toBe("3F");
    expect(ask("지하 내일").floor).toBe("B1");
    const p = ask("10월 20일 30명 이상 3시");
    expect(p).toMatchObject({ minCapacity: 30, fromMin: H(15), dateKeys: ["2026-10-20"] });
  });
});

describe("물어보기 — 답변", () => {
  const res = (room_id: string, s: string, e: string, date = "2026-10-20"): PublicReservation => ({
    id: `${room_id}${s}`, room_id, floor: "3F", room_name: "", seating_type: "의자", capacity_text: "",
    title: "모임", department: "청년부", attendees: null,
    start_at: seoulToUtc(date, s).toISOString(), end_at: seoulToUtc(date, e).toISOString(), recurrence_group_id: null,
  });
  const reservations = [res("somang", "14:00", "16:00"), res("lausanne", "17:00", "18:00")];

  it("겹치면 사용 중, 아니면 비어 있음 + 언제까지 비는지", () => {
    const [day] = answerQuestion(ask("10월 20일 3시"), ROOMS, reservations);
    const somang = day.rooms.find((r) => r.room.id === "somang")!;
    const lausanne = day.rooms.find((r) => r.room.id === "lausanne")!;
    expect(somang.free).toBe(false);
    expect(somang.conflicts[0]).toMatchObject({ fromMin: H(14), toMin: H(16) });
    expect(lausanne).toMatchObject({ free: true, freeUntil: H(17) });
  });

  it("구간 안의 빈 시간", () => {
    const [day] = answerQuestion(ask("10월 20일 소망홀 1시~6시"), ROOMS, reservations);
    expect(day.rooms).toHaveLength(1);
    expect(day.rooms[0].freeWindows).toEqual([[H(13), H(14)], [H(16), H(18)]]);
  });

  it("인원 조건으로 거른다", () => {
    const [day] = answerQuestion(ask("10월 20일 3시 30명"), ROOMS, reservations);
    expect(day.rooms.map((r) => r.room.id).sort()).toEqual(["nuri", "r401", "sion", "somang"]);
  });
});

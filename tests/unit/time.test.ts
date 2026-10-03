import { describe, expect, it } from "vitest";
import {
  addMonthsToKey,
  clipToDay,
  countWeeklyUntil,
  daysOfMonth,
  fmtRange,
  minToLabel,
  seoulToUtc,
  toDateKey,
  weekOf,
} from "@/lib/time";

describe("시간 유틸 (Asia/Seoul)", () => {
  it("서울 날짜+시간 → UTC", () => {
    expect(seoulToUtc("2026-10-03", "09:00").toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(seoulToUtc("2026-10-03", "24:00").toISOString()).toBe("2026-10-03T15:00:00.000Z"); // 다음날 00:00 KST
  });

  it("UTC → 서울 날짜 키", () => {
    expect(toDateKey("2026-10-03T14:59:00Z")).toBe("2026-10-03"); // 23:59 KST
    expect(toDateKey("2026-10-03T15:00:00Z")).toBe("2026-10-04"); // 00:00 KST
  });

  it("자정 넘김 예약은 두 날짜로 잘린다", () => {
    const s = seoulToUtc("2026-10-03", "22:00");
    const e = seoulToUtc("2026-10-04", "02:00");
    expect(clipToDay(s, e, "2026-10-03")).toEqual({ fromMin: 22 * 60, toMin: 24 * 60, continuesBefore: false, continuesAfter: true });
    expect(clipToDay(s, e, "2026-10-04")).toEqual({ fromMin: 0, toMin: 2 * 60, continuesBefore: true, continuesAfter: false });
    expect(clipToDay(s, e, "2026-10-05")).toBeNull();
  });

  it("표시 문자열: 24:00 과 익일", () => {
    expect(fmtRange(seoulToUtc("2026-10-03", "20:00"), seoulToUtc("2026-10-03", "24:00"))).toBe("20:00 ~ 24:00");
    expect(fmtRange(seoulToUtc("2026-10-03", "22:00"), seoulToUtc("2026-10-04", "02:00"))).toBe("22:00 ~ 익일 02:00");
    expect(fmtRange(seoulToUtc("2026-10-03", "10:00"), seoulToUtc("2026-10-03", "12:30"))).toBe("10:00 ~ 12:30");
  });

  it("주는 월요일부터", () => {
    expect(weekOf("2026-10-03")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weekOf("2026-10-05")[0]).toBe("2026-10-05");
  });

  it("월 유틸", () => {
    expect(daysOfMonth("2026-02")).toHaveLength(28);
    expect(daysOfMonth("2028-02")).toHaveLength(29);
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
  });

  it("종료일까지 매주 회차 수", () => {
    const start = seoulToUtc("2026-10-05", "19:00"); // 월
    expect(countWeeklyUntil(start, "2026-10-26")).toBe(4); // 5,12,19,26
    expect(countWeeklyUntil(start, "2026-10-25")).toBe(3);
    expect(countWeeklyUntil(start, "2026-10-05")).toBe(1);
  });

  it("분 → 라벨", () => {
    expect(minToLabel(0)).toBe("00:00");
    expect(minToLabel(90)).toBe("01:30");
    expect(minToLabel(1440)).toBe("24:00");
  });
});

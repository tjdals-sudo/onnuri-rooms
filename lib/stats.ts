/**
 * 월별 사용 통계 (순수 함수) — 장소별 가동률, 부서별 사용 시간, 요일별 사용 시간
 * 시간은 해당 월 안에 들어가는 부분만 센다 (월을 걸친 예약은 잘라서).
 */
import { daysOfMonth, monthRange, toDateKey } from "./time";
import type { Floor, Reservation, Room } from "./types";

/** 가동률 기준: 하루 06:00 ~ 24:00 (18시간) */
export const OPEN_HOURS_PER_DAY = 18;
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const NO_DEPARTMENT = "(부서 미입력)";

export interface RoomStat {
  roomId: string;
  floor: Floor;
  name: string;
  count: number;
  hours: number;
  /** 0~1 */
  utilization: number;
}

export interface DeptStat {
  department: string;
  count: number;
  hours: number;
}

export interface MonthStats {
  monthKey: string;
  totalCount: number;
  totalHours: number;
  departmentCount: number;
  rooms: RoomStat[];
  departments: DeptStat[];
  /** 일요일부터 7개 */
  weekdayHours: number[];
}

type Res = Pick<Reservation, "room_id" | "department" | "start_at" | "end_at">;

export function computeMonthStats(rooms: Room[], reservations: Res[], monthKey: string): MonthStats {
  const { start, end } = monthRange(monthKey);
  const openHours = daysOfMonth(monthKey).length * OPEN_HOURS_PER_DAY;
  const byRoom = new Map<string, { count: number; hours: number }>();
  const byDept = new Map<string, { count: number; hours: number }>();
  const weekdayHours = [0, 0, 0, 0, 0, 0, 0];
  let totalCount = 0;
  let totalHours = 0;

  for (const r of reservations) {
    const s = Math.max(new Date(r.start_at).getTime(), start.getTime());
    const e = Math.min(new Date(r.end_at).getTime(), end.getTime());
    if (e <= s) continue;
    const hours = (e - s) / 3_600_000;
    totalCount++;
    totalHours += hours;

    const room = byRoom.get(r.room_id) ?? { count: 0, hours: 0 };
    room.count++;
    room.hours += hours;
    byRoom.set(r.room_id, room);

    const deptName = r.department.trim() || NO_DEPARTMENT;
    const dept = byDept.get(deptName) ?? { count: 0, hours: 0 };
    dept.count++;
    dept.hours += hours;
    byDept.set(deptName, dept);

    // 요일은 (월 안으로 자른) 시작 날짜 기준
    const key = toDateKey(new Date(s));
    weekdayHours[new Date(`${key}T00:00:00Z`).getUTCDay()] += hours;
  }

  const roomStats: RoomStat[] = rooms
    .filter((room) => room.is_active || byRoom.has(room.id))
    .map((room) => {
      const v = byRoom.get(room.id) ?? { count: 0, hours: 0 };
      return { roomId: room.id, floor: room.floor, name: room.name, count: v.count, hours: v.hours, utilization: Math.min(1, v.hours / openHours) };
    })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, "ko"));

  const departments: DeptStat[] = Array.from(byDept, ([department, v]) => ({ department, ...v })).sort(
    (a, b) => b.hours - a.hours || a.department.localeCompare(b.department, "ko"),
  );

  return {
    monthKey,
    totalCount,
    totalHours,
    departmentCount: departments.filter((d) => d.department !== NO_DEPARTMENT).length,
    rooms: roomStats,
    departments,
    weekdayHours,
  };
}

/** 12.5 → "12.5시간", 3 → "3시간" */
export function fmtHours(h: number): string {
  const v = Math.round(h * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}시간`;
}

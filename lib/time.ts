/**
 * 시간 유틸 — 모든 계산은 Asia/Seoul 기준.
 * DB 에는 timestamptz(UTC ISO) 로 저장되고, 화면은 항상 한국 시간으로 보여 준다.
 */
import { addDays, addMinutes, differenceInMinutes, format } from "date-fns";
import { ko } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const TZ = "Asia/Seoul";
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES; // 48

/** 'YYYY-MM-DD' (서울 기준) */
export function toDateKey(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy-MM-dd");
}

/** 'YYYY-MM' (서울 기준) */
export function toMonthKey(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy-MM");
}

/** 오늘 날짜 키 (서울) */
export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** 'YYYY-MM-DD' + 'HH:mm' (서울) → UTC Date. time 이 '24:00' 이면 다음날 00:00 */
export function seoulToUtc(dateKey: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const base = fromZonedTime(`${dateKey}T00:00:00`, TZ);
  return addMinutes(base, h * 60 + (m || 0));
}

/** 서울 기준 하루의 시작/끝(UTC Date) */
export function dayRange(dateKey: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${dateKey}T00:00:00`, TZ);
  return { start, end: addDays(start, 1) };
}

/** 날짜 키에 일수 더하기 */
export function addDaysToKey(dateKey: string, days: number): string {
  const d = fromZonedTime(`${dateKey}T12:00:00`, TZ);
  return toDateKey(addDays(d, days));
}

/** 'YYYY-MM' 에서 월 범위(UTC Date) */
export function monthRange(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split("-").map(Number);
  const start = fromZonedTime(`${monthKey}-01T00:00:00`, TZ);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const end = fromZonedTime(`${nextMonth}-01T00:00:00`, TZ);
  return { start, end };
}

export function addMonthsToKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** 월의 날짜 키 목록 */
export function daysOfMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`);
}

/** 해당 날짜가 속한 주(월요일 시작)의 날짜 키 7개 */
export function weekOf(dateKey: string): string[] {
  const d = fromZonedTime(`${dateKey}T12:00:00`, TZ);
  const dow = (toZonedTime(d, TZ).getDay() + 6) % 7; // 월=0
  const monday = addDaysToKey(dateKey, -dow);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
}

/** 'HH:mm' (서울) */
export function fmtTime(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "HH:mm");
}

/** 'M월 d일 (요일)' */
export function fmtDateKo(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "M월 d일 (EEE)", { locale: ko });
}

/** 'yyyy년 M월 d일 (요일)' */
export function fmtFullDateKo(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy년 M월 d일 (EEE)", { locale: ko });
}

/** 'yyyy-MM-dd HH:mm' */
export function fmtDateTime(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy-MM-dd HH:mm");
}

/** 날짜 키 → '2026년 10월 3일 (토)' */
export function fmtDateKeyKo(dateKey: string): string {
  return fmtFullDateKo(fromZonedTime(`${dateKey}T12:00:00`, TZ));
}

export function fmtMonthKo(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}년 ${m}월`;
}

/** 요일 한 글자 */
export function weekdayKo(dateKey: string): string {
  const d = fromZonedTime(`${dateKey}T12:00:00`, TZ);
  return format(toZonedTime(d, TZ), "EEEEE", { locale: ko });
}

/**
 * 예약 시작~종료를 표시용 문자열로. 자정을 넘기면 '22:00 ~ 익일 02:00'
 */
export function fmtRange(start: Date | string, end: Date | string): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const sameDay = toDateKey(s) === toDateKey(e) || (fmtTime(e) === "00:00" && toDateKey(addMinutes(e, -1)) === toDateKey(s));
  const endLabel = fmtTime(e) === "00:00" && toDateKey(addMinutes(e, -1)) === toDateKey(s) ? "24:00" : fmtTime(e);
  return sameDay ? `${fmtTime(s)} ~ ${endLabel}` : `${fmtTime(s)} ~ 익일 ${fmtTime(e)}`;
}

/**
 * 어떤 날짜(서울 기준) 하루 안에서 예약이 차지하는 구간을 분 단위 [from, to) 로 자른다.
 * 자정을 넘긴 예약은 전날 24:00 까지 / 다음날 00:00 부터 두 조각으로 나뉜다.
 * 겹치지 않으면 null.
 */
export function clipToDay(
  start: Date | string,
  end: Date | string,
  dateKey: string,
): { fromMin: number; toMin: number; continuesBefore: boolean; continuesAfter: boolean } | null {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const { start: dayStart, end: dayEnd } = dayRange(dateKey);
  if (e <= dayStart || s >= dayEnd) return null;
  const cs = s < dayStart ? dayStart : s;
  const ce = e > dayEnd ? dayEnd : e;
  return {
    fromMin: differenceInMinutes(cs, dayStart),
    toMin: differenceInMinutes(ce, dayStart),
    continuesBefore: s < dayStart,
    continuesAfter: e > dayEnd,
  };
}

/** 분 → 'HH:mm' (1440 은 '24:00') */
export function minToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 30분 슬롯 라벨 48개 */
export const SLOT_LABELS: string[] = Array.from({ length: SLOTS_PER_DAY }, (_, i) => minToLabel(i * SLOT_MINUTES));

/** 현재 시각이 서울 기준으로 하루 중 몇 분인지 */
export function nowMinutesOfDay(now: Date = new Date()): number {
  const z = toZonedTime(now, TZ);
  return z.getHours() * 60 + z.getMinutes();
}

/** 예약이 지금 진행 중인지 */
export function isOngoing(start: Date | string, end: Date | string, now: Date = new Date()): boolean {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return s <= now && now < e;
}

/** 매주 반복: 시작 시각에서 n 주 뒤 */
export function addWeeks(d: Date, n: number): Date {
  return addDays(d, 7 * n);
}

/** 종료일(날짜 키)까지 매주 반복할 때 회차 수 (최대 104) */
export function countWeeklyUntil(start: Date, untilDateKey: string): number {
  const until = dayRange(untilDateKey).end;
  let n = 0;
  let cur = start;
  while (cur < until && n < 104) {
    n += 1;
    cur = addWeeks(start, n);
  }
  return n;
}

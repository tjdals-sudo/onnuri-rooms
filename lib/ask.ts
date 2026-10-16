/**
 * "물어보기" — 자연어 질문을 규칙으로 해석해 빈 장소를 찾는다 (AI·외부 API 없음, 비용 0원).
 *
 * 예) "10월 20일 오후 3시 소망홀 비었어?", "다음주 토요일 오전에 빈 방", "내일 2시~4시 30명 이상"
 *
 * 1) parseQuestion: 질문 → 날짜(들)·시간 구간·장소·층·인원 조건
 * 2) answerQuestion: 해석 결과 + 예약 목록 → 장소별 비어 있음/사용 중
 * 모든 날짜·시간은 서울 기준 (날짜 키 'YYYY-MM-DD', 하루 중 분).
 */
import { addDaysToKey, clipToDay, fmtDateKeyKo, minToLabel, todayKey, weekOf } from "./time";
import { FLOOR_LABEL, type Floor, type PublicReservation, type Room } from "./types";

/** 시간을 말하지 않았을 때 보여 줄 하루 범위 (06:00 ~ 24:00) */
export const DAY_FROM = 6 * 60;
export const DAY_TO = 24 * 60;
/** "3시에 비었어?" 처럼 한 시각만 물으면 그 시각부터 30분을 확인한다 */
const POINT_MINUTES = 30;
/** 한 번에 답하는 최대 날짜 수 */
const MAX_DAYS = 7;

export interface ParsedQuestion {
  dateKeys: string[];
  /** 날짜를 말하지 않아 오늘로 가정했는지 */
  dateAssumed: boolean;
  /** 확인할 구간 [fromMin, toMin) */
  fromMin: number;
  toMin: number;
  /** range: 구간을 물음 · point: 한 시각을 물음 · day: 시간을 말하지 않음 */
  mode: "range" | "point" | "day";
  /** 질문에 나온 장소 (없으면 null → 전체) */
  roomIds: string[] | null;
  floor: Floor | null;
  minCapacity: number | null;
}

// ───────────────────────── 장소 ─────────────────────────

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 장소 이름에서 사람들이 부를 법한 이름들을 만든다. 예) 소망홀 → 소망홀, 소망 / 밴드 연습실 → 밴드실, 밴드 */
export function roomAliases(name: string): string[] {
  const keys = new Set<string>();
  const add = (s: string) => {
    const k = s.replace(/[\s()·.,\-]/g, "");
    if (k.length >= 2) keys.add(k);
  };
  add(name);
  const base = name.replace(/\(.*?\)/g, "").trim(); // 오병이어1(왼쪽) → 오병이어1
  add(base);
  if (/홀$/.test(base) && base.length > 2) add(base.slice(0, -1)); // 소망홀 → 소망
  if (/\d$/.test(base)) add(base.replace(/\d+$/, "")); // 오병이어1 → 오병이어 (두 방 모두)
  for (const part of base.split("·")) {
    add(part); // 401·402호 → 401, 402호
    const num = part.match(/^(\d{3})/);
    if (num) {
      add(num[1]);
      add(`${num[1]}호`);
    }
  }
  if (base.includes("밴드")) {
    add("밴드실");
    add("밴드");
  }
  return [...keys];
}

/** 질문에서 장소 이름을 찾아 빼고, 찾은 장소 id 를 돌려준다 */
function extractRooms(text: string, rooms: Room[]): { text: string; roomIds: string[] } {
  const entries = rooms
    .flatMap((r) => roomAliases(r.name).map((key) => ({ key, id: r.id })))
    .sort((a, b) => b.key.length - a.key.length);
  const found = new Set<string>();
  let rest = text;
  for (const { key, id } of entries) {
    // 글자 사이 띄어쓰기는 무시 (소망 홀, 밴드 연습실), 숫자 이름은 앞뒤가 숫자면 안 됨
    const re = new RegExp(`(?<!\\d)${[...key].map(escapeRe).join("\\s*")}(?!\\d)`, "g");
    if (re.test(rest)) {
      found.add(id);
      // 같은 이름을 공유하는 방(오병이어)을 모두 잡을 수 있도록 지우는 건 같은 키를 다 본 뒤에
      entries
        .filter((e) => e.key === key)
        .forEach((e) => found.add(e.id));
      rest = rest.replace(re, " ");
    }
  }
  return { text: rest, roomIds: [...found] };
}

// ───────────────────────── 날짜 ─────────────────────────

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]; // weekOf 가 월요일 시작

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 2월 30일 등
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 연도 없이 말한 날짜가 이미 지났으면 내년으로 */
function upcoming(m: number, d: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  const key = validDate(y, m, d);
  if (key && key >= today) return key;
  return validDate(y + 1, m, d) ?? key;
}

function extractDates(input: string, today: string): { text: string; dateKeys: string[] } {
  let text = input;
  const keys: string[] = [];
  const take = (re: RegExp, fn: (m: RegExpExecArray) => string | string[] | null) => {
    text = text.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const r = fn(m);
      if (!r) return args[0];
      keys.push(...(Array.isArray(r) ? r : [r]));
      return " ";
    });
  };

  // 2026년 10월 20일 / 2026-10-20 / 2026.10.20
  take(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g, (m) => validDate(+m[1], +m[2], +m[3]));
  take(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/g, (m) => validDate(+m[1], +m[2], +m[3]));
  // 10월 20일 / 10/20 / 10.20
  take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g, (m) => upcoming(+m[1], +m[2], today));
  take(/(?<![\d:])(\d{1,2})\s*[/.]\s*(\d{1,2})(?![\d:])/g, (m) => upcoming(+m[1], +m[2], today));
  // 20일 (이번 달, 지났으면 다음 달)
  take(/(?<!\d)(\d{1,2})\s*일(?!\s*동안)/g, (m) => {
    const d = +m[1];
    const [y, mo] = today.split("-").map(Number);
    const key = validDate(y, mo, d);
    if (key && key >= today) return key;
    return mo === 12 ? validDate(y + 1, 1, d) : validDate(y, mo + 1, d);
  });
  // 오늘 / 내일 / 모레 / 글피
  take(/오늘|금일/g, () => today);
  take(/내일|낼/g, () => addDaysToKey(today, 1));
  take(/모레/g, () => addDaysToKey(today, 2));
  take(/글피/g, () => addDaysToKey(today, 3));

  // 이번 주 / 다음 주 / 다다음 주 (+ 요일, 주말)
  // "이번 주말", "다음 주일" 처럼 붙여 쓴 말/일 까지 함께 잡는다
  const weekRe = /(이번|금|다다음|다음|담|차)\s*주(말|일(?!\s*학교))?/;
  const wm = text.match(weekRe);
  let weekOffset: number | null = null;
  const dayIdx: number[] = [];
  if (wm) {
    weekOffset = wm[1] === "이번" || wm[1] === "금" ? 0 : wm[1] === "다다음" ? 2 : 1;
    if (wm[2] === "말") dayIdx.push(5, 6);
    if (wm[2] === "일") dayIdx.push(6);
    text = text.replace(weekRe, " ");
  }
  const week = weekOf(addDaysToKey(today, (weekOffset ?? 0) * 7));

  text = text.replace(/주말/g, () => {
    dayIdx.push(5, 6);
    return " ";
  });
  text = text.replace(/(?<![가-힣])주일(?!\s*학교)/g, () => {
    dayIdx.push(6); // 교회에서 '주일' = 일요일
    return " ";
  });
  text = text.replace(/([월화수목금토일])\s*요일/g, (_, d: string) => {
    dayIdx.push(WEEKDAYS.indexOf(d));
    return " ";
  });
  // "다음주 토" 처럼 '요일' 없이 한 글자만 쓴 경우 (주 표현이 있을 때만)
  if (weekOffset !== null) {
    text = text.replace(/(?<![가-힣])([월화수목금토일])(?![가-힣])/g, (_, d: string) => {
      dayIdx.push(WEEKDAYS.indexOf(d));
      return " ";
    });
  }

  if (dayIdx.length > 0) {
    for (const i of dayIdx) {
      let key = week[i];
      // 주 표현 없이 요일만 말하면 가장 가까운 그 요일 (오늘 포함)
      if (weekOffset === null && key < today) key = addDaysToKey(key, 7);
      keys.push(key);
    }
  } else if (weekOffset !== null) {
    keys.push(...(weekOffset === 0 ? week.filter((k) => k >= today) : week));
  }

  const dateKeys = [...new Set(keys)].sort().slice(0, MAX_DAYS);
  return { text, dateKeys };
}

// ───────────────────────── 시간 ─────────────────────────

const PERIOD = "(오전|오후|아침|낮|저녁|밤|새벽)";
const T_OPT = `${PERIOD}?\\s*(\\d{1,2})\\s*(?:시\\s*(?:(\\d{1,2})\\s*분|(반))?|:(\\d{2}))?`;
const T_REQ = `${PERIOD}?\\s*(\\d{1,2})\\s*(?:시\\s*(?:(\\d{1,2})\\s*분|(반))?|:(\\d{2}))`;
const RANGE_RE = new RegExp(`${T_OPT}\\s*(?:~|-|–|부터|에서)\\s*${T_OPT}\\s*(?:까지)?`);
const POINT_RE = new RegExp(T_REQ);

/** 오전/오후 없이 말하면: 1~7시 → 오후, 8~11시 → 오전 (교회 일정 기준) */
function toMinutes(period: string | undefined, hStr: string, min1?: string, half?: string, min2?: string): number | null {
  let h = Number(hStr);
  const m = min1 ? Number(min1) : half ? 30 : min2 ? Number(min2) : 0;
  if (h > 24 || m > 59) return null;
  if (period === "오전" || period === "아침" || period === "새벽") {
    if (h === 12) h = 0;
  } else if (period === "오후" || period === "저녁" || period === "밤") {
    if (h < 12) h += 12;
    else if (h === 12 && period === "밤") h = 24;
  } else if (period === "낮") {
    if (h <= 6) h += 12;
  } else if (h >= 1 && h <= 7) {
    h += 12;
  }
  const total = h * 60 + m;
  return total > DAY_TO ? null : total;
}

/** 시간 없이 때만 말한 경우 */
const PERIOD_RANGES: [RegExp, number, number][] = [
  [/하루\s*종일|종일|하루/, 0, DAY_TO],
  [/새벽/, 5 * 60, 7 * 60],
  [/아침/, 7 * 60, 9 * 60],
  [/오전/, 9 * 60, 12 * 60],
  [/점심/, 12 * 60, 13 * 60],
  [/오후|낮/, 12 * 60, 18 * 60],
  [/저녁/, 18 * 60, 22 * 60],
  [/밤/, 19 * 60, 23 * 60],
];

function extractTime(input: string): { text: string; fromMin: number; toMin: number; mode: ParsedQuestion["mode"] } {
  let text = input;

  // 지속 시간: "2시간", "1시간 반", "30분 동안"
  let duration: number | null = null;
  text = text.replace(/(\d+)\s*시간\s*(반)?(?:\s*동안)?/, (_, h: string, half?: string) => {
    duration = Number(h) * 60 + (half ? 30 : 0);
    return " ";
  });
  text = text.replace(/(\d+)\s*분\s*(?:동안|간)/, (_, m: string) => {
    duration = Number(m);
    return " ";
  });

  const rm = text.match(RANGE_RE);
  if (rm && /시|:/.test(rm[0])) {
    const start = toMinutes(rm[1], rm[2], rm[3], rm[4], rm[5]);
    let end = toMinutes(rm[6] ?? rm[1], rm[7], rm[8], rm[9], rm[10]);
    if (start !== null && end !== null) {
      // "오후 2시~4시", "11시~1시" 처럼 끝이 앞서면 12시간 뒤로
      while (end <= start && end + 12 * 60 <= DAY_TO) end += 12 * 60;
      if (end > start) return { text: text.replace(rm[0], " "), fromMin: start, toMin: end, mode: "range" };
    }
  }

  const pm = text.match(POINT_RE);
  if (pm) {
    const t = toMinutes(pm[1], pm[2], pm[3], pm[4], pm[5]);
    if (t !== null) {
      const rest = text.replace(pm[0], " ");
      if (duration) return { text: rest, fromMin: t, toMin: Math.min(t + duration, DAY_TO), mode: "range" };
      // "5시까지" → 지금(하루 시작)부터가 아니라 그 시각 직전까지를 묻는 경우는 드물어 한 시각으로 본다
      return { text: rest, fromMin: t, toMin: Math.min(t + POINT_MINUTES, DAY_TO), mode: "point" };
    }
  }

  for (const [re, from, to] of PERIOD_RANGES) {
    if (re.test(text)) {
      return { text: text.replace(re, " "), fromMin: from, toMin: to, mode: from === 0 ? "day" : "range" };
    }
  }
  return { text, fromMin: DAY_FROM, toMin: DAY_TO, mode: "day" };
}

// ───────────────────────── 해석 ─────────────────────────

export function parseQuestion(question: string, rooms: Room[], now: Date = new Date()): ParsedQuestion {
  const today = todayKey(now);
  let text = ` ${question.replace(/온누리|교회/g, " ")} `;

  let minCapacity: number | null = null;
  text = text.replace(/(\d+)\s*(?:명|인)/, (_, n: string) => {
    minCapacity = Number(n);
    return " ";
  });

  const r = extractRooms(text, rooms);
  text = r.text;

  let floor: Floor | null = null;
  text = text.replace(/지하\s*1?\s*층?|\bB1\b|비원/i, () => {
    floor = "B1";
    return " ";
  });
  if (!floor) {
    text = text.replace(/([1-4])\s*층/, (_, n: string) => {
      floor = `${n}F` as Floor;
      return " ";
    });
  }

  const d = extractDates(text, today);
  const t = extractTime(d.text);

  return {
    dateKeys: d.dateKeys.length > 0 ? d.dateKeys : [today],
    dateAssumed: d.dateKeys.length === 0,
    fromMin: t.fromMin,
    toMin: t.toMin,
    mode: t.mode,
    roomIds: r.roomIds.length > 0 ? r.roomIds : null,
    floor,
    minCapacity,
  };
}

/** 해석이 의미 있는지 (아무것도 못 알아들었으면 도움말을 보여 준다) */
export function understoodAnything(question: string, p: ParsedQuestion): boolean {
  return !p.dateAssumed || p.mode !== "day" || p.roomIds !== null || p.floor !== null || p.minCapacity !== null
    || /빈|비었|비어|비는|남는|가능|있어|있나|있니|사용|예약/.test(question);
}

// ───────────────────────── 답변 ─────────────────────────

export interface Conflict {
  title: string;
  department: string;
  fromMin: number;
  toMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface RoomAnswer {
  room: Room;
  free: boolean;
  /** 확인 구간과 겹치는 예약 */
  conflicts: Conflict[];
  /** 확인 구간 안에서 비어 있는 구간들 */
  freeWindows: [number, number][];
  /** point 모드: 이 시각부터 언제까지 비어 있는지 */
  freeUntil: number | null;
}

export interface DayAnswer {
  dateKey: string;
  rooms: RoomAnswer[];
}

export function answerQuestion(p: ParsedQuestion, rooms: Room[], reservations: PublicReservation[]): DayAnswer[] {
  const targets = rooms.filter(
    (r) =>
      (!p.roomIds || p.roomIds.includes(r.id)) &&
      (!p.floor || r.floor === p.floor) &&
      (!p.minCapacity || (r.capacity_num ?? 0) >= p.minCapacity),
  );

  return p.dateKeys.map((dateKey) => ({
    dateKey,
    rooms: targets.map((room) => {
      const busy: Conflict[] = reservations
        .filter((r) => r.room_id === room.id)
        .flatMap((r) => {
          const c = clipToDay(r.start_at, r.end_at, dateKey);
          return c ? [{ title: r.title, department: r.department, ...c }] : [];
        })
        .sort((a, b) => a.fromMin - b.fromMin);

      const conflicts = busy.filter((b) => b.fromMin < p.toMin && b.toMin > p.fromMin);

      const freeWindows: [number, number][] = [];
      let cur = p.fromMin;
      for (const b of conflicts) {
        if (b.fromMin > cur) freeWindows.push([cur, b.fromMin]);
        cur = Math.max(cur, b.toMin);
      }
      if (cur < p.toMin) freeWindows.push([cur, p.toMin]);

      let freeUntil: number | null = null;
      if (p.mode === "point" && conflicts.length === 0) {
        freeUntil = busy.find((b) => b.fromMin >= p.toMin)?.fromMin ?? DAY_TO;
      }

      return { room, free: conflicts.length === 0, conflicts, freeWindows, freeUntil };
    }),
  }));
}

/** "10월 20일 (화) · 15:00 ~ 17:00 · 소망홀" 같은 해석 요약 */
export function describeParsed(p: ParsedQuestion, rooms: Room[]): string {
  const parts: string[] = [];
  const dates = p.dateKeys.map((k) => fmtDateKeyKo(k).replace(/^\d+년 /, ""));
  parts.push(dates.length > 3 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : dates.join(", "));
  if (p.mode === "point") parts.push(`${minToLabel(p.fromMin)}`);
  else if (p.mode === "range" || p.fromMin !== DAY_FROM || p.toMin !== DAY_TO)
    parts.push(`${minToLabel(p.fromMin)} ~ ${minToLabel(p.toMin)}`);
  else parts.push("하루 전체");
  if (p.roomIds) parts.push(rooms.filter((r) => p.roomIds!.includes(r.id)).map((r) => r.name).join(", "));
  if (p.floor) parts.push(FLOOR_LABEL[p.floor]);
  if (p.minCapacity) parts.push(`${p.minCapacity}명 이상`);
  return parts.join(" · ");
}

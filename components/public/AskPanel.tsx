"use client";
import { useState } from "react";
import {
  answerQuestion,
  describeParsed,
  parseQuestion,
  understoodAnything,
  type DayAnswer,
  type ParsedQuestion,
  type RoomAnswer,
} from "@/lib/ask";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { fetchPublicReservations } from "@/lib/public-data";
import { dayRange, fmtDateKeyKo, minToLabel, todayKey } from "@/lib/time";
import { FLOOR_SHORT, type Room } from "@/lib/types";

const EXAMPLES = ["내일 오후 3시 소망홀 비었어?", "다음주 토요일 오전 빈 장소", "10월 25일 2시~4시 30명 이상"];

type Result =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "answer"; parsed: ParsedQuestion; summary: string; days: DayAnswer[] };

const range = (from: number, to: number) => `${minToLabel(from)}~${minToLabel(to)}`;
const shortDate = (k: string) => fmtDateKeyKo(k).replace(/^\d+년 /, "");

function RoomTag({ room }: { room: Room }) {
  const c = FLOOR_COLORS[room.floor];
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: c.text }}>
      <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: c.bg }}>
        {FLOOR_SHORT[room.floor]}
      </span>
      {room.name}
    </span>
  );
}

function ConflictList({ a }: { a: RoomAnswer }) {
  return (
    <ul className="mt-0.5 text-sm text-muted">
      {a.conflicts.map((c, i) => (
        <li key={i}>
          {c.continuesBefore ? "전날부터" : minToLabel(c.fromMin)} ~ {c.continuesAfter ? "다음날까지" : minToLabel(c.toMin)}{" "}
          · {c.title}
          {c.department && ` (${c.department})`}
        </li>
      ))}
    </ul>
  );
}

/** 장소를 콕 집어 물었을 때 — 장소마다 한 줄씩 */
function RoomLines({ day, parsed }: { day: DayAnswer; parsed: ParsedQuestion }) {
  return (
    <ul className="space-y-2">
      {day.rooms.map((a) => (
        <li key={a.room.id}>
          <div className="flex flex-wrap items-center gap-x-2">
            <span aria-hidden>{a.free ? "✅" : a.freeWindows.length > 0 ? "🟡" : "❌"}</span>
            <RoomTag room={a.room} />
            <span>
              {a.free
                ? parsed.mode === "point"
                  ? `비어 있어요 (${minToLabel(a.freeUntil ?? parsed.toMin)}까지)`
                  : parsed.mode === "day"
                    ? "하루 종일 비어 있어요"
                    : "비어 있어요"
                : a.freeWindows.length > 0
                  ? `일부만 비어요 — 빈 시간 ${a.freeWindows.map(([f, t]) => range(f, t)).join(", ")}`
                  : "사용 중이에요"}
            </span>
          </div>
          {!a.free && <ConflictList a={a} />}
        </li>
      ))}
    </ul>
  );
}

/** 전체(또는 층·인원 조건)로 물었을 때 — 빈 곳 목록 + 사용 중인 곳 접기 */
function FreeList({ day, parsed }: { day: DayAnswer; parsed: ParsedQuestion }) {
  if (parsed.mode === "day") {
    const allDay = day.rooms.filter((a) => a.free);
    const partly = day.rooms.filter((a) => !a.free);
    return (
      <div className="space-y-2">
        {allDay.length > 0 && (
          <div>
            <p className="mb-1 font-semibold">종일 비어 있는 곳 ({allDay.length}곳)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {allDay.map((a) => (
                <RoomTag key={a.room.id} room={a.room} />
              ))}
            </div>
          </div>
        )}
        {partly.length > 0 && (
          <div>
            <p className="mb-1 font-semibold">예약이 있는 곳 — 빈 시간</p>
            <ul className="space-y-1">
              {partly.map((a) => (
                <li key={a.room.id} className="flex flex-wrap items-center gap-x-2">
                  <RoomTag room={a.room} />
                  <span className="text-sm">
                    {a.freeWindows.length > 0 ? a.freeWindows.map(([f, t]) => range(f, t)).join(", ") : "빈 시간 없음"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const free = day.rooms.filter((a) => a.free);
  const busy = day.rooms.filter((a) => !a.free);
  return (
    <div className="space-y-2">
      {free.length === 0 ? (
        <p>❌ 비어 있는 곳이 없어요.</p>
      ) : (
        <div>
          <p className="mb-1 font-semibold">✅ 비어 있는 곳 ({free.length}곳)</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {free.map((a) => (
              <li key={a.room.id} className="flex items-center gap-1.5">
                <RoomTag room={a.room} />
                {parsed.mode === "point" && a.freeUntil !== null && (
                  <span className="text-sm text-muted">{minToLabel(a.freeUntil)}까지</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {busy.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">사용 중인 곳 {busy.length}곳 보기</summary>
          <ul className="mt-1 space-y-1.5">
            {busy.map((a) => (
              <li key={a.room.id}>
                <RoomTag room={a.room} />
                <ConflictList a={a} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function AskPanel({ rooms, onShowDate }: { rooms: Room[]; onShowDate: (dateKey: string) => void }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    const parsed = parseQuestion(text, rooms);
    if (!understoodAnything(text, parsed)) {
      setResult({ kind: "help" });
      return;
    }
    setBusy(true);
    try {
      const start = dayRange(parsed.dateKeys[0]).start;
      const end = dayRange(parsed.dateKeys[parsed.dateKeys.length - 1]).end;
      const reservations = await fetchPublicReservations(start, end);
      setResult({
        kind: "answer",
        parsed,
        summary: describeParsed(parsed, rooms),
        days: answerQuestion(parsed, rooms, reservations),
      });
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : "불러오지 못했습니다" });
    } finally {
      setBusy(false);
    }
  };

  const today = todayKey();

  return (
    <section className="card mb-4 p-4" aria-label="빈 장소 물어보기">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input flex-1"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="물어보세요 — 예: 내일 오후 3시 소망홀 비었어?"
          aria-label="빈 장소 질문"
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={busy}>
          {busy ? "찾는 중…" : "물어보기"}
        </button>
      </form>

      {!result && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">예시</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => {
                setQuestion(ex);
                void ask(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-line bg-background p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            {result.kind === "answer" ? (
              <p className="text-sm text-muted">
                🔎 <span className="font-semibold text-foreground">{result.summary}</span> 기준으로 찾았어요
                {result.parsed.dateAssumed && " (날짜를 말하지 않아 오늘로 봤어요)"}
              </p>
            ) : (
              <span />
            )}
            <button type="button" className="text-sm text-muted hover:underline" onClick={() => setResult(null)}>
              닫기
            </button>
          </div>

          {result.kind === "help" && (
            <div className="text-sm">
              <p className="font-semibold">질문을 이해하지 못했어요 😅</p>
              <p className="mt-1 text-muted">
                날짜·시간·장소를 넣어서 물어봐 주세요. 예: &ldquo;10월 20일 오후 3시 소망홀&rdquo;, &ldquo;내일 저녁 빈 방&rdquo;,
                &ldquo;다음주 주일 2시~4시 3층&rdquo;
              </p>
            </div>
          )}

          {result.kind === "error" && <p className="text-danger">불러오지 못했습니다: {result.message}</p>}

          {result.kind === "answer" &&
            (result.days.every((d) => d.rooms.length === 0) ? (
              <p>조건에 맞는 장소가 없어요.</p>
            ) : (
              <div className="space-y-4">
                {result.days.map((day) => (
                  <div key={day.dateKey}>
                    {(result.days.length > 1 || day.dateKey !== today) && (
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="font-bold">{shortDate(day.dateKey)}</h4>
                        <button
                          type="button"
                          className="text-sm text-accent hover:underline"
                          onClick={() => onShowDate(day.dateKey)}
                        >
                          표로 보기 →
                        </button>
                      </div>
                    )}
                    {day.dateKey < today && <p className="mb-1 text-sm text-muted">이미 지난 날짜예요.</p>}
                    {result.parsed.roomIds ? (
                      <RoomLines day={day} parsed={result.parsed} />
                    ) : (
                      <FreeList day={day} parsed={result.parsed} />
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

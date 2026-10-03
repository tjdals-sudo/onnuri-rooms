"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPublicReservations, fetchRooms } from "@/lib/public-data";
import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";
import {
  addDaysToKey,
  addMonthsToKey,
  dayRange,
  fmtDateKeyKo,
  fmtMonthKo,
  monthRange,
  todayKey,
  weekOf,
} from "@/lib/time";
import { FLOORS, FLOOR_SHORT, type Floor, type PublicReservation, type Room } from "@/lib/types";
import DayGrid from "./DayGrid";
import MobileDayList from "./MobileDayList";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import FreeNowPanel from "./FreeNowPanel";

type View = "day" | "week" | "month";

export default function HomeClient() {
  const router = useRouter();
  const params = useSearchParams();

  const view = (params.get("view") as View) || "day";
  const dateKey = params.get("date") || todayKey();
  const floor = (params.get("floor") as Floor | null) || null;
  const [query, setQuery] = useState("");

  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [resState, setResState] = useState<{ key: string; data: PublicReservation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  // 조회 범위
  const range = useMemo(() => {
    if (view === "day") return dayRange(dateKey);
    if (view === "week") {
      const days = weekOf(dateKey);
      return { start: dayRange(days[0]).start, end: dayRange(days[6]).end };
    }
    return monthRange(dateKey.slice(0, 7));
  }, [view, dateKey]);

  const rangeKey = `${range.start.toISOString()}_${range.end.toISOString()}`;
  const load = useCallback(async () => {
    try {
      const [r, res] = await Promise.all([fetchRooms(), fetchPublicReservations(range.start, range.end)]);
      setRooms(r);
      setResState({ key: rangeKey, data: res });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다");
    }
  }, [range.start, range.end, rangeKey]);

  // 범위가 바뀌면 다시 조회 (외부 데이터 동기화 — 마이크로태스크로 넘겨 렌더와 분리)
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const reservations = resState && resState.key === rangeKey ? resState.data : null;

  useRealtimeRefresh(() => void load());

  // 현재 시각 1분마다 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 필터 적용
  const filteredRooms = useMemo(() => {
    if (!rooms) return [];
    const q = query.trim();
    return rooms.filter((r) => (!floor || r.floor === floor) && (!q || r.name.includes(q)));
  }, [rooms, floor, query]);

  const roomIds = useMemo(() => new Set(filteredRooms.map((r) => r.id)), [filteredRooms]);
  const filteredReservations = useMemo(
    () => (reservations ?? []).filter((r) => roomIds.has(r.room_id)),
    [reservations, roomIds],
  );

  const isToday = dateKey === todayKey(now);
  const loading = rooms === null || reservations === null;

  const move = (delta: number) => {
    if (view === "day") setParam({ date: addDaysToKey(dateKey, delta) });
    else if (view === "week") setParam({ date: addDaysToKey(dateKey, delta * 7) });
    else setParam({ date: `${addMonthsToKey(dateKey.slice(0, 7), delta)}-01` });
  };

  const title =
    view === "month"
      ? fmtMonthKo(dateKey.slice(0, 7))
      : view === "week"
        ? `${fmtDateKeyKo(weekOf(dateKey)[0])} ~ ${fmtDateKeyKo(weekOf(dateKey)[6]).replace(/^\d+년 /, "")}`
        : fmtDateKeyKo(dateKey);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>⛪</span>
            <div>
              <h1 className="text-lg font-bold leading-tight md:text-xl">인천 온누리교회 장소 사용 현황</h1>
              <p className="hidden text-sm text-muted md:block">누구나 실시간으로 확인할 수 있어요</p>
            </div>
          </div>
          <Link href="/admin" className="btn btn-sm">
            관리자
          </Link>
        </div>

        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 pb-3">
          {/* 날짜 이동 + 보기 전환 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button className="btn btn-sm" onClick={() => move(-1)} aria-label="이전">
                ◀
              </button>
              <button className="btn btn-sm" onClick={() => setParam({ date: null })}>
                오늘
              </button>
              <button className="btn btn-sm" onClick={() => move(1)} aria-label="다음">
                ▶
              </button>
              <input
                type="date"
                className="input ml-1 w-auto! py-1.5 text-sm"
                value={dateKey}
                onChange={(e) => e.target.value && setParam({ date: e.target.value })}
                aria-label="날짜 선택"
              />
            </div>
            <h2 className="order-last w-full text-lg font-semibold md:order-none md:w-auto">{title}</h2>
            <div role="tablist" className="flex overflow-hidden rounded-lg border border-line bg-surface">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={`px-4 py-2 text-base font-medium ${view === v ? "bg-accent text-white" : "hover:bg-accent-soft"}`}
                  onClick={() => setParam({ view: v === "day" ? null : v })}
                >
                  {v === "day" ? "일" : v === "week" ? "주" : "월"}
                </button>
              ))}
            </div>
          </div>

          {/* 층 필터 + 검색 */}
          <div className="flex flex-wrap items-center gap-2">
            <button className={`chip ${!floor ? "chip-active" : ""}`} onClick={() => setParam({ floor: null })}>
              전체
            </button>
            {FLOORS.map((f) => (
              <button
                key={f}
                className={`chip ${floor === f ? "chip-active" : ""}`}
                onClick={() => setParam({ floor: floor === f ? null : f })}
              >
                {FLOOR_SHORT[f]}
              </button>
            ))}
            <input
              type="search"
              className="input ml-auto w-full md:w-56"
              placeholder="장소 검색 (예: 소망홀)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="장소 검색"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">
        {error && (
          <div className="card mb-4 border-danger/40 bg-red-50 p-4 text-danger">
            <p className="font-semibold">불러오지 못했습니다</p>
            <p className="text-sm">{error}</p>
            <button className="btn btn-sm mt-2" onClick={() => void load()}>
              다시 시도
            </button>
          </div>
        )}

        {loading && !error ? (
          <div className="space-y-3" aria-busy>
            <div className="skeleton h-24" />
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
          </div>
        ) : (
          <>
            {view === "day" && isToday && (
              <FreeNowPanel rooms={filteredRooms} reservations={filteredReservations} now={now} />
            )}
            {view === "day" && (
              <>
                <div className="hidden md:block">
                  <DayGrid rooms={filteredRooms} reservations={filteredReservations} dateKey={dateKey} now={now} />
                </div>
                <div className="md:hidden">
                  <MobileDayList
                    rooms={filteredRooms}
                    reservations={filteredReservations}
                    dateKey={dateKey}
                    now={now}
                    onSwipe={(d) => move(d)}
                  />
                </div>
              </>
            )}
            {view === "week" && (
              <WeekView
                days={weekOf(dateKey)}
                reservations={filteredReservations}
                now={now}
                onSelectDay={(d) => setParam({ view: null, date: d })}
              />
            )}
            {view === "month" && (
              <MonthView
                monthKey={dateKey.slice(0, 7)}
                reservations={filteredReservations}
                onSelectDay={(d) => setParam({ view: null, date: d })}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center text-sm text-muted">
        인천 온누리교회 · 예약 문의는 각 부서 담당자에게 연락해 주세요
      </footer>
    </div>
  );
}

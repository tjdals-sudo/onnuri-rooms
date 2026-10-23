"use client";
import Image from "next/image";
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
import AskPanel from "./AskPanel";
import { fitPrintArea } from "@/lib/print-fit";

type View = "day" | "week" | "month";

export default function HomeClient({ initialRooms = null }: { initialRooms?: Room[] | null }) {
  const router = useRouter();
  const params = useSearchParams();

  const view = (params.get("view") as View) || "day";
  const dateKey = params.get("date") || todayKey();
  const floor = (params.get("floor") as Floor | null) || null;
  const [query, setQuery] = useState("");

  const [rooms, setRooms] = useState<Room[] | null>(initialRooms);
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
      const days = weekOf(dateKey, "sun");
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

  // 필터 적용: 장소 이름이 맞으면 그 장소의 예약 전부(인쇄용), 맞는 장소가 없으면 행사명·부서가 맞는 예약만
  const q = normalize(query);
  const { filteredRooms, filteredReservations } = useMemo(() => {
    const floorRooms = (rooms ?? []).filter((r) => !floor || r.floor === floor);
    const all = reservations ?? [];
    if (!q) {
      const ids = new Set(floorRooms.map((r) => r.id));
      return { filteredRooms: floorRooms, filteredReservations: all.filter((r) => ids.has(r.room_id)) };
    }
    const nameHit = new Set(floorRooms.filter((r) => normalize(r.name).includes(q)).map((r) => r.id));
    const floorIds = new Set(floorRooms.map((r) => r.id));
    const res = all.filter(
      (r) =>
        floorIds.has(r.room_id) &&
        (nameHit.size > 0
          ? nameHit.has(r.room_id)
          : normalize(r.title).includes(q) || normalize(r.department).includes(q)),
    );
    const ids = new Set([...nameHit, ...res.map((r) => r.room_id)]);
    return { filteredRooms: floorRooms.filter((r) => ids.has(r.id)), filteredReservations: res };
  }, [rooms, reservations, floor, q]);

  const singleRoom = filteredRooms.length === 1 ? filteredRooms[0] : null;

  // 브라우저 메뉴로 인쇄해도 한 장에 맞도록
  useEffect(() => {
    window.addEventListener("beforeprint", fitPrintArea);
    return () => window.removeEventListener("beforeprint", fitPrintArea);
  }, []);

  // 인쇄: PDF 로 저장할 때 파일 이름이 되도록 제목을 잠시 바꾼다
  const print = () => {
    const prev = document.title;
    document.title = `${singleRoom ? `${singleRoom.name} ` : ""}${fmtMonthKo(dateKey.slice(0, 7))} 예약 현황`;
    window.print();
    document.title = prev;
  };

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
        ? `${fmtDateKeyKo(weekOf(dateKey, "sun")[0])} ~ ${fmtDateKeyKo(weekOf(dateKey, "sun")[6]).replace(/^\d+년 /, "")}`
        : fmtDateKeyKo(dateKey);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="온누리교회" width={40} height={40} className="h-10 w-10 rounded-lg" priority />
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
              placeholder="장소·행사명 검색 (예: 소망홀)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="장소·행사명 검색"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 print:max-w-none print:p-0">
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
            <div className="print:hidden">
              <AskPanel rooms={rooms ?? []} onShowDate={(d) => setParam({ view: null, date: d })} />
            </div>
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
                days={weekOf(dateKey, "sun")}
                reservations={filteredReservations}
                now={now}
                onSelectDay={(d) => setParam({ view: null, date: d })}
              />
            )}
            {view === "month" && (
              <>
                {singleRoom && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
                    <p className="text-base">
                      <strong>{singleRoom.name}</strong> {fmtMonthKo(dateKey.slice(0, 7))} 예약을 모두 보여 드려요.
                    </p>
                    <button className="btn" onClick={print}>
                      🖨 A4로 인쇄
                    </button>
                  </div>
                )}
                <div id="print-area">
                  {/* 인쇄용 머리말 (화면에서는 숨김) */}
                  <div className="mb-2 hidden items-end justify-between print:flex">
                    <div className="flex items-center gap-2">
                      <Image src="/logo.jpg" alt="" width={36} height={36} className="h-9 w-9 rounded-md" />
                      <h1 className="text-2xl font-bold">
                        {singleRoom ? `${singleRoom.name} ` : ""}
                        {fmtMonthKo(dateKey.slice(0, 7))} 예약 현황
                      </h1>
                      {singleRoom && (
                        <span className="text-sm text-muted">
                          {FLOOR_SHORT[singleRoom.floor]} · {singleRoom.capacity_text} · {singleRoom.seating_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-right text-xs leading-snug text-muted">
                        인천온누리교회
                        <br />
                        장소 예약 현황
                      </p>
                      {/* public/qr.svg = https://onnuri-rooms.vercel.app (주소가 바뀌면 다시 만들 것) */}
                      <Image src="/qr.svg" alt="" width={56} height={56} className="h-14 w-14" unoptimized />
                    </div>
                  </div>
                  <MonthView
                    monthKey={dateKey.slice(0, 7)}
                    reservations={filteredReservations}
                    showAll={Boolean(singleRoom) || q !== ""}
                    singleRoom={Boolean(singleRoom)}
                    onSelectDay={(d) => setParam({ view: null, date: d })}
                  />
                </div>
              </>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center text-sm text-muted print:hidden">
        인천 온누리교회 · 장소예약 v1.0.2
      </footer>
    </div>
  );
}

/** 검색 비교용: 띄어쓰기·대소문자 무시 ("워십 연습" = "워십연습") */
function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

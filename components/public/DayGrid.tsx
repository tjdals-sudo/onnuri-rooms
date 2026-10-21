"use client";
import { useEffect, useRef, useState } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { clipToDay, fmtRange, isOngoing, nowMinutesOfDay, todayKey } from "@/lib/time";
import { FLOORS, FLOOR_LABEL, type PublicReservation, type Room } from "@/lib/types";

const PX_PER_MIN = 1.5; // 30분 = 45px, 하루 = 2160px
const ROW_H = 52;
const LABEL_W = 180;

/** PC 타임라인: 세로 장소(층별 그룹) × 가로 00:00~24:00 */
export default function DayGrid({
  rooms,
  reservations,
  dateKey,
  now,
}: {
  rooms: Room[];
  reservations: PublicReservation[];
  dateKey: string;
  now: Date;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const isToday = dateKey === todayKey(now);
  const nowMin = nowMinutesOfDay(now);
  const [picked, setPicked] = useState<{ r: PublicReservation; rect: DOMRect } | null>(null);

  // 처음 열면 현재 시각 2시간 전으로 스크롤
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? Math.max(0, (nowMin - 120) * PX_PER_MIN) : 8 * 60 * PX_PER_MIN;
    el.scrollLeft = target;
    // dateKey 가 바뀔 때만 다시 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  if (rooms.length === 0) {
    return <div className="card p-8 text-center text-muted">조건에 맞는 장소가 없습니다.</div>;
  }

  const byRoom = new Map<string, PublicReservation[]>();
  for (const r of reservations) {
    const arr = byRoom.get(r.room_id) ?? [];
    arr.push(r);
    byRoom.set(r.room_id, arr);
  }

  const totalW = 24 * 60 * PX_PER_MIN;

  return (
    <div className="card overflow-hidden">
      <div ref={scroller} className="relative overflow-x-auto">
        <div style={{ width: LABEL_W + totalW }}>
          {/* 시간 헤더 */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-line bg-surface px-3 py-2 text-sm font-semibold text-muted"
              style={{ width: LABEL_W }}
            >
              장소
            </div>
            <div className="relative" style={{ width: totalW, height: 36 }}>
              {Array.from({ length: 25 }, (_, h) => (
                <div
                  key={h}
                  className="absolute top-0 h-full border-l border-line text-xs text-muted"
                  style={{ left: h * 60 * PX_PER_MIN }}
                >
                  <span className="absolute left-1 top-2">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
          </div>

          {FLOORS.map((floor) => {
            const floorRooms = rooms.filter((r) => r.floor === floor);
            if (floorRooms.length === 0) return null;
            const c = FLOOR_COLORS[floor];
            return (
              <div key={floor}>
                <div className="flex border-b border-line" style={{ background: c.soft }}>
                  <div
                    className="sticky left-0 z-10 shrink-0 px-3 py-1 text-sm font-bold"
                    style={{ width: LABEL_W, color: c.text, background: c.soft }}
                  >
                    {FLOOR_LABEL[floor]}
                  </div>
                </div>
                {floorRooms.map((room) => {
                  const items = byRoom.get(room.id) ?? [];
                  return (
                    <div key={room.id} className="flex border-b border-line" style={{ height: ROW_H }}>
                      <div
                        className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface px-3"
                        style={{ width: LABEL_W }}
                      >
                        <span className="truncate font-semibold">{room.name}</span>
                        <span className="truncate text-xs text-muted">
                          {room.capacity_text} · {room.seating_type}
                        </span>
                      </div>
                      <div className="relative" style={{ width: totalW }}>
                        {/* 30분 격자 */}
                        {Array.from({ length: 48 }, (_, i) => (
                          <div
                            key={i}
                            className={`absolute top-0 h-full border-l ${i % 2 === 0 ? "border-line" : "border-line/40"}`}
                            style={{ left: i * 30 * PX_PER_MIN }}
                          />
                        ))}
                        {items.map((r) => {
                          const clip = clipToDay(r.start_at, r.end_at, dateKey);
                          if (!clip) return null;
                          const ongoing = isOngoing(r.start_at, r.end_at, now);
                          const left = clip.fromMin * PX_PER_MIN;
                          const width = Math.max(6, (clip.toMin - clip.fromMin) * PX_PER_MIN - 2);
                          return (
                            <button
                              type="button"
                              key={r.id}
                              data-res-bar
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setPicked((p) => (p?.r.id === r.id ? null : { r, rect }));
                              }}
                              className="absolute top-1 flex h-[calc(100%-8px)] cursor-pointer items-center gap-1 overflow-hidden px-2 text-sm text-white shadow-sm"
                              style={{
                                left: left + 1,
                                width,
                                background: c.bg,
                                borderRadius: `${clip.continuesBefore ? 0 : 8}px ${clip.continuesAfter ? 0 : 8}px ${clip.continuesAfter ? 0 : 8}px ${clip.continuesBefore ? 0 : 8}px`,
                                outline: ongoing ? "3px solid #d93025" : undefined,
                                outlineOffset: -3,
                              }}
                              title={`${FLOOR_LABEL[r.floor]} ${r.room_name} · ${fmtRange(r.start_at, r.end_at)} · ${r.title}${r.department ? ` · ${r.department}` : ""}`}
                            >
                              {ongoing && (
                                <span className="shrink-0 rounded bg-white/90 px-1 text-[11px] font-bold text-[#b42318]">
                                  사용 중
                                </span>
                              )}
                              <span className="truncate font-semibold">{r.title}</span>
                              {width > 160 && <span className="truncate opacity-90">· {r.department}</span>}
                              {width > 260 && <span className="shrink-0 opacity-90">· {fmtRange(r.start_at, r.end_at)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 현재 시각 선 */}
          {isToday && (
            <div
              className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-[#d93025]"
              style={{ left: LABEL_W + nowMin * PX_PER_MIN }}
              aria-hidden
            >
              <span className="absolute -left-5 top-9 whitespace-nowrap rounded bg-[#d93025] px-1 text-[11px] font-bold text-white">
                지금
              </span>
            </div>
          )}
        </div>
      </div>
      {picked && <ReservationPopover r={picked.r} rect={picked.rect} now={now} onClose={() => setPicked(null)} />}
      {reservations.length === 0 && (
        <p className="border-t border-line p-4 text-center text-muted">이 날 예약이 없습니다.</p>
      )}
    </div>
  );
}

const POP_W = 240;

/** 예약 막대를 누르면 뜨는 작은 정보 칸 */
function ReservationPopover({
  r,
  rect,
  now,
  onClose,
}: {
  r: PublicReservation;
  rect: DOMRect;
  now: Date;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const c = FLOOR_COLORS[r.floor];

  // 바깥 클릭·Esc·스크롤·창 크기 변경 시 닫기
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || t.closest?.("[data-res-bar]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // 막대 아래에 띄우되, 화면 아래가 모자라면 위로
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const left = Math.min(Math.max(8, rect.left), vw - POP_W - 8);
  const below = rect.bottom + 6 + 150 < vh;
  const pos = below ? { top: rect.bottom + 6 } : { bottom: vh - rect.top + 6 };
  const ongoing = isOngoing(r.start_at, r.end_at, now);

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="예약 정보"
      className="fixed z-50 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg"
      style={{ left, width: POP_W, borderTop: `4px solid ${c.bg}`, ...pos }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-line/50"
      >
        ✕
      </button>
      <p className="pr-6 font-bold leading-snug break-keep">{r.title}</p>
      <dl className="mt-2 space-y-1 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-muted">시간</dt>
          <dd>
            {fmtRange(r.start_at, r.end_at)}
            {ongoing && <span className="ml-1 font-bold text-[#b42318]">사용 중</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-muted">장소</dt>
          <dd>
            {FLOOR_LABEL[r.floor]} {r.room_name}
          </dd>
        </div>
        {r.department && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-muted">부서</dt>
            <dd className="break-keep">{r.department}</dd>
          </div>
        )}
        {r.attendees != null && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-muted">인원</dt>
            <dd>{r.attendees}명</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

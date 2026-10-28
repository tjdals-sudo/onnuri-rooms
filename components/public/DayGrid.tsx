"use client";
import { useEffect, useRef, useState } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { clipToDay, fmtRange, fmtTime, isOngoing, nowMinutesOfDay, todayKey } from "@/lib/time";
import { FLOORS, FLOOR_LABEL, type PublicReservation, type Room } from "@/lib/types";
import ReservationPopover from "./ReservationPopover";

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
              className="sticky left-0 z-30 shrink-0 bg-surface px-5 py-2 text-sm text-muted"
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
                <div className="flex border-b border-line bg-background">
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 bg-background px-5 py-2.5 text-sm font-bold"
                    style={{ width: LABEL_W }}
                  >
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.bg }} aria-hidden />
                    {FLOOR_LABEL[floor]}
                    <span className="font-normal text-muted">{floorRooms.length}곳</span>
                  </div>
                </div>
                {floorRooms.map((room) => {
                  const items = byRoom.get(room.id) ?? [];
                  return (
                    <div key={room.id} className="flex border-b border-line" style={{ height: ROW_H }}>
                      <div
                        className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface px-5"
                        style={{ width: LABEL_W }}
                      >
                        <span className="truncate text-[15.5px] font-semibold">{room.name}</span>
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
                              className="absolute top-2 flex h-[calc(100%-16px)] cursor-pointer items-center gap-2 overflow-hidden px-3 text-sm text-white transition hover:brightness-110"
                              style={{
                                left: left + 1,
                                width,
                                background: c.bg,
                                borderRadius: `${clip.continuesBefore ? 0 : 9}px ${clip.continuesAfter ? 0 : 9}px ${clip.continuesAfter ? 0 : 9}px ${clip.continuesBefore ? 0 : 9}px`,
                              }}
                              title={`${FLOOR_LABEL[r.floor]} ${r.room_name} · ${fmtRange(r.start_at, r.end_at)} · ${r.title}${r.department ? ` · ${r.department}` : ""}`}
                            >
                              {ongoing && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-white" aria-label="사용 중" />}
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
              className="pointer-events-none absolute top-0 z-20 h-full w-px bg-brass"
              style={{ left: LABEL_W + nowMin * PX_PER_MIN }}
              aria-hidden
            >
              <span className="absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brass px-2.5 py-0.5 text-xs font-bold text-white">
                지금 {fmtTime(now)}
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

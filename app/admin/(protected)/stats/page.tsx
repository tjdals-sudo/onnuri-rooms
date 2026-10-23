import Link from "next/link";
import type { ReactNode } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { OPEN_HOURS_PER_DAY, WEEKDAYS, computeMonthStats, fmtHours } from "@/lib/stats";
import { getServerSupabase } from "@/lib/supabase/server";
import { addMonthsToKey, fmtMonthKo, monthRange, toMonthKey } from "@/lib/time";
import { FLOOR_SHORT, type Reservation, type Room } from "@/lib/types";

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : toMonthKey(new Date());
  const { start, end } = monthRange(monthKey);

  const supabase = await getServerSupabase();
  const [roomsRes, resRes] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order").order("name"),
    supabase
      .from("reservations")
      .select("room_id, department, start_at, end_at")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString()),
  ]);
  const error = roomsRes.error?.message || resRes.error?.message || null;
  const stats = computeMonthStats(
    (roomsRes.data ?? []) as Room[],
    (resRes.data ?? []) as Pick<Reservation, "room_id" | "department" | "start_at" | "end_at">[],
    monthKey,
  );

  const maxRoomHours = Math.max(1, ...stats.rooms.map((r) => r.hours));
  const maxDeptHours = Math.max(1, ...stats.departments.map((d) => d.hours));
  const maxWeekday = Math.max(1, ...stats.weekdayHours);
  const busiestDay = stats.totalHours > 0 ? WEEKDAYS[stats.weekdayHours.indexOf(Math.max(...stats.weekdayHours))] : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">사용 통계</h1>
        <form className="flex items-center gap-1" method="get">
          <Link className="btn btn-sm" href={`/admin/stats?month=${addMonthsToKey(monthKey, -1)}`} aria-label="이전 달">◀</Link>
          <input className="input w-auto! py-1.5 text-sm" type="month" name="month" defaultValue={monthKey} aria-label="월 선택" />
          <button className="btn btn-sm" type="submit">보기</button>
          <Link className="btn btn-sm" href={`/admin/stats?month=${addMonthsToKey(monthKey, 1)}`} aria-label="다음 달">▶</Link>
        </form>
      </div>

      {error && <div className="card border-danger/40 bg-red-50 p-3 text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={`${fmtMonthKo(monthKey)} 예약`} value={`${stats.totalCount}건`} />
        <Tile label="총 사용 시간" value={fmtHours(stats.totalHours)} />
        <Tile label="사용한 부서" value={`${stats.departmentCount}곳`} />
        <Tile label="가장 붐비는 요일" value={busiestDay === "—" ? "—" : `${busiestDay}요일`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="장소별 사용" note={`가동률 = 사용 시간 ÷ (그 달 날수 × 하루 ${OPEN_HOURS_PER_DAY}시간, 06~24시)`}>
          <table className="table text-sm">
            <thead><tr><th>장소</th><th className="w-full">사용 시간</th><th className="text-right">건수</th><th className="text-right">가동률</th></tr></thead>
            <tbody>
              {stats.rooms.map((r) => (
                <tr key={r.roomId}>
                  <td className="whitespace-nowrap">
                    <span className="mr-1 rounded px-1 text-[11px] font-bold text-white" style={{ background: FLOOR_COLORS[r.floor].bg }}>{FLOOR_SHORT[r.floor]}</span>
                    {r.name}
                  </td>
                  <td><Bar ratio={r.hours / maxRoomHours} label={fmtHours(r.hours)} /></td>
                  <td className="text-right tabular-nums">{r.count}</td>
                  <td className="text-right tabular-nums">{Math.round(r.utilization * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="space-y-5">
          <Section title="요일별 사용 시간">
            <table className="table text-sm">
              <tbody>
                {WEEKDAYS.map((d, i) => (
                  <tr key={d}>
                    <td className="w-10 font-semibold">{d}</td>
                    <td><Bar ratio={stats.weekdayHours[i] / maxWeekday} label={fmtHours(stats.weekdayHours[i])} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="부서별 사용" note="이름이 흩어져 있으면 '부서 관리'에서 합칠 수 있어요.">
            {stats.departments.length === 0 ? (
              <p className="py-6 text-center text-muted">이 달에는 예약이 없습니다.</p>
            ) : (
              <table className="table text-sm">
                <thead><tr><th>부서</th><th className="w-full">사용 시간</th><th className="text-right">건수</th></tr></thead>
                <tbody>
                  {stats.departments.map((d) => (
                    <tr key={d.department}>
                      <td className="whitespace-nowrap">{d.department}</td>
                      <td><Bar ratio={d.hours / maxDeptHours} label={fmtHours(d.hours)} /></td>
                      <td className="text-right tabular-nums">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      </div>
      <p className="text-sm text-muted">월을 걸친 예약은 이 달에 들어가는 시간만 셉니다. 요일은 시작 날짜 기준입니다.</p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card overflow-x-auto p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

/** 가로 막대 (값은 막대 옆 글자로도 표시) */
function Bar({ ratio, label }: { ratio: number; label: string }) {
  return (
    <div className="flex min-w-40 items-center gap-2" title={label}>
      <div className="h-3 flex-1 rounded-r bg-transparent">
        {ratio > 0 && <div className="h-3 rounded-r bg-accent" style={{ width: `${Math.max(2, ratio * 100)}%` }} />}
      </div>
      <span className="w-20 shrink-0 text-right tabular-nums text-muted">{label}</span>
    </div>
  );
}

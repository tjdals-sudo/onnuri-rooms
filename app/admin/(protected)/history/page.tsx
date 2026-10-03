import { summarizeAudit, type RoomNameMap } from "@/lib/audit-format";
import { getServerSupabase } from "@/lib/supabase/server";
import { dayRange, fmtDateTime, todayKey, addDaysToKey } from "@/lib/time";
import type { AuditLog, Room } from "@/lib/types";

type SP = { from?: string; to?: string; admin?: string; action?: string; table?: string };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayKey();
  const from = sp.from || addDaysToKey(today, -30);
  const to = sp.to || today;

  const supabase = await getServerSupabase();
  let q = supabase
    .from("audit_logs")
    .select("*")
    .gte("created_at", dayRange(from).start.toISOString())
    .lt("created_at", dayRange(to).end.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.admin) q = q.eq("admin_login_id", sp.admin);
  if (sp.action) q = q.eq("action", sp.action);
  if (sp.table) q = q.eq("target_table", sp.table);

  const [{ data: logs, error }, { data: rooms }] = await Promise.all([q, supabase.from("rooms").select("id, floor, name")]);
  const roomMap: RoomNameMap = new Map(((rooms ?? []) as Pick<Room, "id" | "floor" | "name">[]).map((r) => [r.id, { floor: r.floor, name: r.name }]));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">변경 이력</h1>
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" method="get">
        <div><label className="label">시작일</label><input className="input" type="date" name="from" defaultValue={from} /></div>
        <div><label className="label">종료일</label><input className="input" type="date" name="to" defaultValue={to} /></div>
        <div>
          <label className="label">관리자</label>
          <select className="input" name="admin" defaultValue={sp.admin ?? ""}>
            <option value="">전체</option>
            {["admin1", "admin2", "admin3", "system"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">작업</label>
          <select className="input" name="action" defaultValue={sp.action ?? ""}>
            <option value="">전체</option><option value="insert">등록</option><option value="update">수정</option><option value="delete">삭제</option>
          </select>
        </div>
        <div>
          <label className="label">대상</label>
          <select className="input" name="table" defaultValue={sp.table ?? ""}>
            <option value="">전체</option><option value="reservations">예약</option><option value="rooms">장소</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">조회</button>
      </form>

      {error && <p className="card mb-3 bg-red-50 p-3 text-danger">{error.message}</p>}
      <p className="mb-2 text-sm text-muted">{(logs ?? []).length}건 (최대 500건). 이력은 DB 트리거가 자동 기록하며 수정·삭제할 수 없습니다.</p>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>일시</th><th>관리자</th><th>작업</th><th>대상</th><th>변경 내용 (변경 전 → 변경 후)</th></tr></thead>
          <tbody>
            {(logs ?? []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">해당 조건의 이력이 없습니다.</td></tr>}
            {((logs ?? []) as AuditLog[]).map((log) => {
              const s = summarizeAudit(log, roomMap);
              return (
                <tr key={log.id}>
                  <td className="whitespace-nowrap tabular-nums">{fmtDateTime(log.created_at)}</td>
                  <td className="font-semibold">{log.admin_login_id}</td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${log.action === "insert" ? "bg-ok" : log.action === "update" ? "bg-[#2c6fb0]" : "bg-danger"}`}>
                      {s.tableLabel} {s.actionLabel}
                    </span>
                  </td>
                  <td>{s.target}</td>
                  <td>
                    {s.changes.length === 0 ? <span className="text-muted">—</span> : (
                      <ul className="space-y-0.5 text-sm">
                        {s.changes.map((c) => (
                          <li key={c.label}>
                            <span className="text-muted">{c.label}:</span>{" "}
                            {log.action === "update" ? <><span className="line-through opacity-70">{c.before}</span> → <strong>{c.after}</strong></> : log.action === "insert" ? <strong>{c.after}</strong> : <span className="opacity-70">{c.before}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

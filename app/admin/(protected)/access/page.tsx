import { getServerSupabase } from "@/lib/supabase/server";
import { addDaysToKey, dayRange, fmtDateTime, todayKey } from "@/lib/time";
import type { LoginLog } from "@/lib/types";

type SP = { from?: string; to?: string; admin?: string };

export default async function AccessPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayKey();
  const from = sp.from || addDaysToKey(today, -30);
  const to = sp.to || today;

  const supabase = await getServerSupabase();
  let q = supabase
    .from("login_logs")
    .select("*")
    .gte("created_at", dayRange(from).start.toISOString())
    .lt("created_at", dayRange(to).end.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.admin) q = q.eq("admin_login_id", sp.admin);
  const { data, error } = await q;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">접속 기록</h1>
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" method="get">
        <div><label className="label">시작일</label><input className="input" type="date" name="from" defaultValue={from} /></div>
        <div><label className="label">종료일</label><input className="input" type="date" name="to" defaultValue={to} /></div>
        <div>
          <label className="label">관리자</label>
          <select className="input" name="admin" defaultValue={sp.admin ?? ""}>
            <option value="">전체</option>
            {["admin1", "admin2", "admin3"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">조회</button>
      </form>
      {error && <p className="card mb-3 bg-red-50 p-3 text-danger">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>일시</th><th>관리자</th><th>이벤트</th></tr></thead>
          <tbody>
            {(data ?? []).length === 0 && <tr><td colSpan={3} className="py-8 text-center text-muted">기록이 없습니다.</td></tr>}
            {((data ?? []) as LoginLog[]).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap tabular-nums">{fmtDateTime(l.created_at)}</td>
                <td className="font-semibold">{l.admin_login_id}</td>
                <td>{l.event === "login" ? <span className="text-ok">로그인</span> : <span className="text-muted">로그아웃</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted">로그아웃 버튼을 누르지 않고 창을 닫으면 로그아웃 기록이 남지 않습니다.</p>
    </div>
  );
}

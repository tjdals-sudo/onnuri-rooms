"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addDepartment, mergeDepartmentName, updateDepartment } from "@/lib/actions/departments";
import { fmtDateKo } from "@/lib/time";
import type { ActionResult, Department, DepartmentUsage } from "@/lib/types";

export default function DepartmentsManager({ departments, usage }: { departments: Department[]; usage: DepartmentUsage[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; sort_order: number } | null>(null);
  const [mergeTo, setMergeTo] = useState<Record<string, string>>({});

  const countByName = useMemo(() => new Map(usage.map((u) => [u.department, Number(u.reservation_count)])), [usage]);
  const listNames = useMemo(() => new Set(departments.map((d) => d.name)), [departments]);
  const unlisted = usage.filter((u) => u.department.trim() !== "" && !listNames.has(u.department));
  const emptyCount = usage.filter((u) => u.department.trim() === "").reduce((n, u) => n + Number(u.reservation_count), 0);
  const active = departments.filter((d) => d.is_active);

  const run = <T,>(fn: () => Promise<ActionResult<T>>, msg?: (data: T) => string) =>
    start(async () => {
      setError(null);
      setToast(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      if (msg) setToast(msg(r.data));
      router.refresh();
    });

  const add = (name: string) =>
    run(async () => {
      const r = await addDepartment(name);
      if (r.ok) setNewName("");
      return r;
    }, () => `'${name.trim()}' 부서를 목록에 넣었습니다.`);

  const saveEdit = () => {
    if (!editing) return;
    const before = departments.find((d) => d.id === editing.id);
    const renaming = before && before.name !== editing.name.trim();
    const n = before ? countByName.get(before.name) ?? 0 : 0;
    if (renaming && n > 0 && !window.confirm(`'${before.name}' 으로 된 예약 ${n}건의 부서 이름도 '${editing.name.trim()}' 으로 바뀝니다. 계속할까요?`)) return;
    run(async () => {
      const r = await updateDepartment(editing.id, { name: editing.name, sort_order: editing.sort_order });
      if (r.ok) setEditing(null);
      return r;
    }, (d) => (d.renamed > 0 ? `저장했습니다. 예약 ${d.renamed}건의 부서 이름도 바꿨습니다.` : "저장했습니다."));
  };

  const merge = (from: string) => {
    const to = mergeTo[from] ?? "";
    if (!to) return setError("합칠 부서를 골라 주세요.");
    const n = countByName.get(from) ?? 0;
    if (!window.confirm(`'${from}' 으로 된 예약 ${n}건을 '${to}' 으로 바꿉니다. 계속할까요?`)) return;
    run(() => mergeDepartmentName(from, to), (d) => `예약 ${d.count}건을 '${to}' 으로 합쳤습니다.`);
  };

  const clearName = (from: string) => {
    const n = countByName.get(from) ?? 0;
    if (!window.confirm(`'${from}' 은(는) 부서 이름이 아닌가요? 예약 ${n}건의 부서 칸을 비웁니다. 계속할까요?`)) return;
    run(() => mergeDepartmentName(from, ""), (d) => `예약 ${d.count}건의 부서 칸을 비웠습니다.`);
  };

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="card bg-red-50 p-3 text-danger">{error}</p>}
      {toast && <p role="status" className="card border-ok/40 bg-green-50 p-3 text-ok">{toast}</p>}

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">부서 목록 <span className="text-muted">({active.length}곳)</span></h2>
          <form
            className="ml-auto flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) add(newName);
            }}
          >
            <input className="input w-44! py-1.5 text-sm" placeholder="새 부서 이름" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn btn-primary btn-sm" type="submit" disabled={pending || !newName.trim()}>＋ 추가</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead><tr><th>순서</th><th>부서</th><th className="text-right">예약</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {departments.map((d) =>
                editing?.id === d.id ? (
                  <tr key={d.id}>
                    <td><input className="input w-20! py-1 text-sm" type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} /></td>
                    <td><input className="input py-1 text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></td>
                    <td className="text-right tabular-nums">{countByName.get(d.name) ?? 0}건</td>
                    <td />
                    <td className="whitespace-nowrap">
                      <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending || !editing.name.trim()}>저장</button>{" "}
                      <button className="btn btn-sm" onClick={() => setEditing(null)}>취소</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id} className={d.is_active ? "" : "opacity-60"}>
                    <td className="tabular-nums">{d.sort_order}</td>
                    <td className="font-semibold">{d.name}</td>
                    <td className="text-right tabular-nums">{countByName.get(d.name) ?? 0}건</td>
                    <td>{d.is_active ? <span className="text-ok">사용</span> : <span className="text-muted">숨김</span>}</td>
                    <td className="whitespace-nowrap">
                      <button className="btn btn-sm" onClick={() => setEditing({ id: d.id, name: d.name, sort_order: d.sort_order })}>수정</button>{" "}
                      <button className="btn btn-sm" disabled={pending} onClick={() => run(() => updateDepartment(d.id, { is_active: !d.is_active }))}>
                        {d.is_active ? "숨기기" : "다시 사용"}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-muted">이름을 고치면 그 이름으로 된 예약도 함께 바뀝니다. 숨긴 부서는 새 예약에서 고를 수 없지만 지난 예약은 그대로입니다.</p>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold">목록에 없는 부서 이름 <span className="text-muted">({unlisted.length}개)</span></h2>
        <p className="mb-3 text-sm text-muted">
          예전에 손으로 적은 이름들입니다. 오타는 목록의 부서로 <strong>합치고</strong>, 맞는 부서면 <strong>목록에 추가</strong>하세요.
          {emptyCount > 0 && ` 부서 칸이 빈 예약도 ${emptyCount}건 있습니다(예약 수정에서 골라 주세요).`}
        </p>
        {unlisted.length === 0 ? (
          <p className="py-6 text-center text-ok">모든 예약이 목록의 부서 이름을 쓰고 있어요 👍</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr><th>예약에 적힌 이름</th><th className="text-right">예약</th><th>예시</th><th>정리</th></tr></thead>
              <tbody>
                {unlisted.map((u) => (
                  <tr key={u.department}>
                    <td className="font-semibold">{u.department}</td>
                    <td className="text-right tabular-nums">{u.reservation_count}건</td>
                    <td className="text-muted">&lsquo;{u.sample_title}&rsquo; · {fmtDateKo(u.last_used)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        <select
                          className="input w-auto! py-1 text-sm"
                          value={mergeTo[u.department] ?? ""}
                          onChange={(e) => setMergeTo({ ...mergeTo, [u.department]: e.target.value })}
                          aria-label={`${u.department} 합칠 부서`}
                        >
                          <option value="">합칠 부서…</option>
                          {active.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </select>
                        <button className="btn btn-sm" disabled={pending} onClick={() => merge(u.department)}>합치기</button>
                        <button className="btn btn-sm" disabled={pending} onClick={() => add(u.department)}>목록에 추가</button>
                        <button className="btn btn-sm" disabled={pending} onClick={() => clearName(u.department)} title="시간·사람 이름처럼 부서가 아닌 값">부서 아님</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveRoom, setRoomActive, type RoomInput } from "@/lib/actions/rooms";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { FLOORS, FLOOR_LABEL, FLOOR_SHORT, SEATING_TYPES, type Floor, type Room, type SeatingType } from "@/lib/types";

const empty: RoomInput = { floor: "1F", name: "", capacity_text: "", capacity_num: null, seating_type: "의자", note: "", sort_order: 0, is_active: true };

export default function RoomsManager({ rooms }: { rooms: Room[] }) {
  const router = useRouter();
  const [form, setForm] = useState<RoomInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (!form) return;
      setError(null);
      const r = await saveRoom(form);
      if (!r.ok) return setError(r.error);
      setForm(null);
      router.refresh();
    });

  const toggle = (room: Room) =>
    start(async () => {
      const r = await setRoomActive(room.id, !room.is_active);
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={() => setForm({ ...empty, sort_order: (Math.max(0, ...rooms.map((r) => r.sort_order)) || 0) + 1 })}>＋ 장소 추가</button>
      </div>
      {error && <p role="alert" className="card bg-red-50 p-3 text-danger">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>순서</th><th>층</th><th>장소명</th><th>수용 인원</th><th>좌석 형태</th><th>비고</th><th>상태</th><th></th></tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const c = FLOOR_COLORS[r.floor];
              return (
                <tr key={r.id} className={r.is_active ? "" : "opacity-60"}>
                  <td className="tabular-nums">{r.sort_order}</td>
                  <td><span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: c.bg }}>{FLOOR_SHORT[r.floor]}</span></td>
                  <td className="font-semibold">{r.name}</td>
                  <td>{r.capacity_text}{r.capacity_num !== null && <span className="text-xs text-muted"> ({r.capacity_num})</span>}</td>
                  <td>{r.seating_type}</td>
                  <td className="text-sm text-muted">{r.note}</td>
                  <td>{r.is_active ? <span className="text-ok">사용</span> : <span className="text-muted">숨김</span>}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn btn-sm" onClick={() => setForm({ id: r.id, floor: r.floor, name: r.name, capacity_text: r.capacity_text, capacity_num: r.capacity_num, seating_type: r.seating_type, note: r.note, sort_order: r.sort_order, is_active: r.is_active })}>수정</button>{" "}
                    <button className="btn btn-sm" onClick={() => toggle(r)} disabled={pending}>{r.is_active ? "숨기기" : "다시 사용"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">장소는 삭제하지 않고 &ldquo;숨기기&rdquo;로 비활성화합니다. 숨긴 장소의 과거 예약과 이력은 그대로 남습니다.</p>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="card w-full max-w-lg p-5">
            <h2 className="mb-3 text-xl font-bold">{form.id ? "장소 수정" : "장소 추가"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">층 *</label>
                <select className="input" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value as Floor })}>
                  {FLOORS.map((f) => <option key={f} value={f}>{FLOOR_LABEL[f]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">장소명 *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">수용 인원 (표시용)</label>
                <input className="input" value={form.capacity_text} placeholder="예: 50명 이상" onChange={(e) => setForm({ ...form, capacity_text: e.target.value })} />
              </div>
              <div>
                <label className="label">수용 인원 (숫자, 경고 기준)</label>
                <input className="input" type="number" min={0} value={form.capacity_num ?? ""} onChange={(e) => setForm({ ...form, capacity_num: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">좌석 형태 *</label>
                <select className="input" value={form.seating_type} onChange={(e) => setForm({ ...form, seating_type: e.target.value as SeatingType })}>
                  {SEATING_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">정렬 순서</label>
                <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">비고</label>
                <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> 사용 중 (체크 해제 시 홈 화면에서 숨김)
              </label>
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => setForm(null)} disabled={pending}>취소</button>
              <button className="btn btn-primary" onClick={submit} disabled={pending || !form.name.trim()}>{pending ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

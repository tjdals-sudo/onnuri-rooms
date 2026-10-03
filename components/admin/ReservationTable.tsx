"use client";
import { useMemo, useState, useTransition } from "react";
import { deleteReservation } from "@/lib/actions/reservations";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { fmtDateKo, fmtDateTime, fmtRange } from "@/lib/time";
import { FLOORS, FLOOR_SHORT, type Floor, type Reservation, type Room } from "@/lib/types";

export default function ReservationTable({
  rooms,
  reservations,
  admins,
  monthKey,
  onEdit,
  onChanged,
}: {
  rooms: Room[];
  reservations: Reservation[];
  admins: Record<string, string>;
  monthKey: string;
  onEdit: (r: Reservation) => void;
  onChanged: (msg: string) => void;
}) {
  const [floor, setFloor] = useState<Floor | "">("");
  const [roomId, setRoomId] = useState("");
  const [dept, setDept] = useState("");
  const [confirm, setConfirm] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const list = useMemo(
    () =>
      reservations.filter((r) => {
        const room = roomMap.get(r.room_id);
        if (floor && room?.floor !== floor) return false;
        if (roomId && r.room_id !== roomId) return false;
        if (dept && !r.department.includes(dept.trim())) return false;
        return true;
      }),
    [reservations, roomMap, floor, roomId, dept],
  );

  const doDelete = (r: Reservation, scope: "one" | "following") =>
    start(async () => {
      setError(null);
      const res = await deleteReservation(r.id, scope);
      setConfirm(null);
      if (!res.ok) return setError(res.error);
      onChanged(scope === "following" ? `이후 회차 ${res.data.count}건을 삭제했습니다.` : "예약을 삭제했습니다.");
    });

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{monthKey.replace("-", "년 ")}월 예약 목록 <span className="text-muted">({list.length}건)</span></h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <select className="input w-auto! py-1.5 text-sm" value={floor} onChange={(e) => { setFloor(e.target.value as Floor | ""); setRoomId(""); }}>
            <option value="">모든 층</option>
            {FLOORS.map((f) => <option key={f} value={f}>{FLOOR_SHORT[f]}</option>)}
          </select>
          <select className="input w-auto! py-1.5 text-sm" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">모든 장소</option>
            {rooms.filter((r) => !floor || r.floor === floor).map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_active ? "" : " (숨김)"}</option>)}
          </select>
          <input className="input w-36! py-1.5 text-sm" placeholder="부서 검색" value={dept} onChange={(e) => setDept(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-danger">{error}</p>}

      {list.length === 0 ? (
        <p className="py-8 text-center text-muted">예약이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table min-w-[1000px] text-sm">
            <thead>
              <tr>
                <th>날짜</th><th>시간</th><th>장소</th><th>행사명</th><th>부서</th><th>담당자</th><th>연락처</th><th>인원</th><th>등록자</th><th>최종 수정</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const room = roomMap.get(r.room_id);
                const c = room ? FLOOR_COLORS[room.floor] : null;
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDateKo(r.start_at)}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtRange(r.start_at, r.end_at)}</td>
                    <td className="whitespace-nowrap">
                      {room && c && (
                        <span className="mr-1 rounded px-1 text-[11px] font-bold text-white" style={{ background: c.bg }}>{FLOOR_SHORT[room.floor]}</span>
                      )}
                      {room?.name ?? "—"}
                    </td>
                    <td>
                      {r.title}
                      {r.recurrence_group_id && <span className="ml-1 rounded bg-accent-soft px-1 text-[11px] text-accent">반복</span>}
                      {r.memo && <div className="text-xs text-muted">{r.memo}</div>}
                    </td>
                    <td className="whitespace-nowrap">{r.department}</td>
                    <td className="whitespace-nowrap">{r.contact_name}</td>
                    <td className="whitespace-nowrap">{r.contact_phone}</td>
                    <td>{r.attendees ?? ""}</td>
                    <td className="whitespace-nowrap">{(r.created_by && admins[r.created_by]) || "—"}</td>
                    <td className="whitespace-nowrap text-xs text-muted">
                      {(r.updated_by && admins[r.updated_by]) || "—"}<br />{fmtDateTime(r.updated_at)}
                    </td>
                    <td className="whitespace-nowrap">
                      <button className="btn btn-sm" onClick={() => onEdit(r)}>수정</button>{" "}
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirm(r)}>삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="card w-full max-w-md p-5">
            <h3 className="text-lg font-bold">예약을 삭제할까요?</h3>
            <p className="mt-1 text-base">
              {fmtDateKo(confirm.start_at)} {fmtRange(confirm.start_at, confirm.end_at)} · {roomMap.get(confirm.room_id)?.name} · &lsquo;{confirm.title}&rsquo;
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn" onClick={() => setConfirm(null)} disabled={pending}>취소</button>
              <button className="btn btn-danger" onClick={() => doDelete(confirm, "one")} disabled={pending}>
                {confirm.recurrence_group_id ? "이 건만 삭제" : "삭제"}
              </button>
              {confirm.recurrence_group_id && (
                <button className="btn btn-danger" onClick={() => doDelete(confirm, "following")} disabled={pending}>이후 전체 삭제</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

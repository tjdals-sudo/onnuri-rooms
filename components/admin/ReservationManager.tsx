"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addMonthsToKey, fmtDateKeyKo, toDateKey } from "@/lib/time";
import type { Reservation, Room } from "@/lib/types";
import AdminCalendar from "./AdminCalendar";
import RoomPicker from "./RoomPicker";
import SlotPicker from "./SlotPicker";
import ReservationForm, { type FormInitial } from "./ReservationForm";
import ReservationTable from "./ReservationTable";

export default function ReservationManager({
  rooms,
  reservations,
  admins,
  monthKey,
  initialDate,
  error,
}: {
  rooms: Room[];
  reservations: Reservation[];
  admins: Record<string, string>;
  monthKey: string;
  initialDate: string;
  error: string | null;
}) {
  const router = useRouter();
  const [dateKey, setDateKey] = useState(initialDate);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial: FormInitial; editing: Reservation | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 서버에서 받은 initialDate 가 바뀌면(월 이동) 선택 날짜도 맞춘다 — 렌더 중 상태 조정 패턴
  const [prevInitial, setPrevInitial] = useState(initialDate);
  if (initialDate !== prevInitial) {
    setPrevInitial(initialDate);
    setDateKey(initialDate);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active), [rooms]);
  const selectedRoom = activeRooms.find((r) => r.id === roomId) ?? null;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of reservations) {
      const k = toDateKey(r.start_at);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [reservations]);

  const gotoMonth = (delta: number) => {
    const m = addMonthsToKey(monthKey, delta);
    router.push(`/admin?month=${m}`);
  };
  const selectDate = (d: string) => {
    setDateKey(d);
    if (d.slice(0, 7) !== monthKey) router.push(`/admin?month=${d.slice(0, 7)}&date=${d}`);
  };

  const openNew = (startTime?: string, endTime?: string) =>
    setForm({ initial: { room_id: roomId ?? undefined, dateKey, startTime, endTime }, editing: null });

  const saved = (msg: string) => {
    setForm(null);
    setToast(msg);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">예약 관리</h1>
        <div className="flex gap-2">
          <a className="btn" href={`/api/export?month=${monthKey}`} download>
            ⬇ {monthKey} 엑셀 다운로드
          </a>
          <button className="btn btn-primary" onClick={() => openNew()}>
            ＋ 새 예약
          </button>
        </div>
      </div>

      {error && <div className="card border-danger/40 bg-red-50 p-3 text-danger">{error}</div>}
      {toast && (
        <div role="status" className="card border-ok/40 bg-green-50 p-3 text-ok">
          {toast}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <AdminCalendar monthKey={monthKey} counts={counts} selected={dateKey} onSelect={selectDate} onMonthChange={gotoMonth} />
          <div className="card p-3">
            <h2 className="mb-2 text-base font-bold">① 장소 선택</h2>
            <RoomPicker rooms={activeRooms} selectedId={roomId} onSelect={setRoomId} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-1 text-lg font-bold">② 시간 선택 · {fmtDateKeyKo(dateKey)}</h2>
            {selectedRoom ? (
              <SlotPicker key={`${selectedRoom.id}-${dateKey}`} room={selectedRoom} dateKey={dateKey} reservations={reservations} onPick={(s, e) => openNew(s, e)} />
            ) : (
              <p className="py-6 text-center text-muted">왼쪽에서 장소를 먼저 선택해 주세요. 이미 찬 시간은 선택할 수 없게 표시됩니다.</p>
            )}
          </div>

          <ReservationTable
            rooms={rooms}
            reservations={reservations}
            admins={admins}
            monthKey={monthKey}
            onEdit={(r) => setForm({ initial: { room_id: r.room_id, dateKey: toDateKey(r.start_at) }, editing: r })}
            onChanged={(msg) => {
              setToast(msg);
              router.refresh();
            }}
          />
        </div>
      </div>

      {form && (
        <ReservationForm
          rooms={activeRooms}
          initial={form.initial}
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

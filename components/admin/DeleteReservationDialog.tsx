"use client";
import { useState, useTransition } from "react";
import { deleteReservation } from "@/lib/actions/reservations";
import { fmtDateKo, fmtRange } from "@/lib/time";
import type { Reservation } from "@/lib/types";

/** 예약 삭제 확인창. 반복 예약이면 '이 건만' / '이후 전체' 를 고른다 */
export default function DeleteReservationDialog({
  reservation,
  roomName,
  onClose,
  onDeleted,
}: {
  reservation: Reservation;
  roomName: string | undefined;
  onClose: () => void;
  onDeleted: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const doDelete = (scope: "one" | "following") =>
    start(async () => {
      setError(null);
      const res = await deleteReservation(reservation.id, scope);
      if (!res.ok) return setError(res.error);
      onDeleted(scope === "following" ? `이후 회차 ${res.data.count}건을 삭제했습니다.` : "예약을 삭제했습니다.");
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="card w-full max-w-md p-5">
        <h3 className="text-lg font-bold">예약을 삭제할까요?</h3>
        <p className="mt-1 text-base">
          {fmtDateKo(reservation.start_at)} {fmtRange(reservation.start_at, reservation.end_at)} · {roomName} · &lsquo;{reservation.title}&rsquo;
        </p>
        {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={pending}>취소</button>
          <button className="btn btn-danger" onClick={() => doDelete("one")} disabled={pending}>
            {reservation.recurrence_group_id ? "이 건만 삭제" : "삭제"}
          </button>
          {reservation.recurrence_group_id && (
            <button className="btn btn-danger" onClick={() => doDelete("following")} disabled={pending}>이후 전체 삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}

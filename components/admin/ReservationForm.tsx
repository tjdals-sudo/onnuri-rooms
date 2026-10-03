"use client";
import { useMemo, useState, useTransition } from "react";
import {
  createRecurring,
  createReservation,
  previewRecurring,
  updateReservation,
  type PreviewRow,
  type ReservationInput,
} from "@/lib/actions/reservations";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { SLOT_LABELS, countWeeklyUntil, fmtDateKo, fmtRange, fmtTime, seoulToUtc, toDateKey } from "@/lib/time";
import { FLOOR_LABEL, type Reservation, type Room } from "@/lib/types";

export interface FormInitial {
  room_id?: string;
  dateKey: string;
  startTime?: string;
  endTime?: string;
}

const START_TIMES = SLOT_LABELS; // 00:00 ~ 23:30
const END_TIMES = [...SLOT_LABELS.slice(1), "24:00"]; // 00:30 ~ 24:00

function splitEnd(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (fmtTime(d) === "00:00") {
    const prev = new Date(d.getTime() - 60_000);
    return { date: toDateKey(prev), time: "24:00" };
  }
  return { date: toDateKey(d), time: fmtTime(d) };
}

export default function ReservationForm({
  rooms,
  initial,
  editing,
  onClose,
  onSaved,
}: {
  rooms: Room[];
  initial: FormInitial;
  editing: Reservation | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const endInit = editing ? splitEnd(editing.end_at) : null;
  const [roomId, setRoomId] = useState(editing?.room_id ?? initial.room_id ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [contactName, setContactName] = useState(editing?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(editing?.contact_phone ?? "");
  const [attendees, setAttendees] = useState(editing?.attendees?.toString() ?? "");
  const [memo, setMemo] = useState(editing?.memo ?? "");
  const [startDate, setStartDate] = useState(editing ? toDateKey(editing.start_at) : initial.dateKey);
  const [startTime, setStartTime] = useState(editing ? fmtTime(editing.start_at) : initial.startTime ?? "10:00");
  const [endDate, setEndDate] = useState(endInit?.date ?? initial.dateKey);
  const [endTime, setEndTime] = useState(endInit?.time ?? initial.endTime ?? "12:00");

  const [repeat, setRepeat] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"count" | "until">("count");
  const [repeatCount, setRepeatCount] = useState("4");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [scope, setScope] = useState<"one" | "following">("one");

  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const room = rooms.find((r) => r.id === roomId) ?? null;
  const startIso = useMemo(() => (startDate && startTime ? seoulToUtc(startDate, startTime).toISOString() : ""), [startDate, startTime]);
  const endIso = useMemo(() => (endDate && endTime ? seoulToUtc(endDate, endTime).toISOString() : ""), [endDate, endTime]);
  const attendeesNum = attendees.trim() === "" ? null : Number(attendees);
  const overCapacity = room?.capacity_num != null && attendeesNum !== null && attendeesNum > room.capacity_num;
  const count = repeatMode === "count" ? Number(repeatCount) || 0 : repeatUntil && startIso ? countWeeklyUntil(new Date(startIso), repeatUntil) : 0;
  const isRecurringEdit = Boolean(editing?.recurrence_group_id);

  const buildInput = (): ReservationInput => ({
    room_id: roomId,
    title,
    department,
    contact_name: contactName,
    contact_phone: contactPhone,
    attendees: attendeesNum,
    start_at: startIso,
    end_at: endIso,
    memo,
  });

  const doPreview = () =>
    start(async () => {
      setError(null);
      const r = await previewRecurring(roomId, startIso, endIso, count);
      if (!r.ok) setError(r.error);
      else setPreview(r.data);
    });

  const submit = (skipConflicts = true) =>
    start(async () => {
      setError(null);
      if (!roomId) return setError("장소를 선택해 주세요.");
      if (editing) {
        const r = await updateReservation(editing.id, buildInput(), isRecurringEdit ? scope : "one");
        if (!r.ok) return setError(r.error);
        onSaved(scope === "following" && isRecurringEdit ? `이후 회차 ${r.data.count}건을 수정했습니다.` : "예약을 수정했습니다.");
        return;
      }
      if (repeat && count > 1) {
        const r = await createRecurring(buildInput(), count, skipConflicts);
        if (!r.ok) return setError(r.error);
        onSaved(`반복 예약 ${r.data.created}건을 등록했습니다.${r.data.skipped.length ? ` (충돌 ${r.data.skipped.length}건 제외)` : ""}`);
        return;
      }
      const r = await createReservation(buildInput());
      if (!r.ok) return setError(r.error);
      onSaved("예약을 등록했습니다.");
    });

  const conflicts = preview?.filter((p) => p.conflict_id) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="card max-h-[95vh] w-full max-w-2xl overflow-y-auto p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{editing ? "예약 수정" : "새 예약"}</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">장소 *</label>
            <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">선택하세요</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {FLOOR_LABEL[r.floor]} {r.name} — {r.capacity_text}, {r.seating_type}
                </option>
              ))}
            </select>
            {room && (
              <p className="mt-1 text-sm" style={{ color: FLOOR_COLORS[room.floor].text }}>
                {FLOOR_LABEL[room.floor]} · {room.name} · 수용 {room.capacity_text} · {room.seating_type}
                {room.note ? ` · ${room.note}` : ""}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label">행사명 *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 청년부 예배" required />
          </div>
          <div>
            <label className="label">사용 부서</label>
            <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="예: 청년부" />
          </div>
          <div>
            <label className="label">예상 인원</label>
            <input className="input" type="number" min={0} value={attendees} onChange={(e) => setAttendees(e.target.value)} />
            {overCapacity && <p className="mt-1 text-sm text-[#8a5a00]">⚠ 수용 인원({room?.capacity_text})을 넘습니다. 등록은 가능합니다.</p>}
          </div>
          <div>
            <label className="label">담당자 이름</label>
            <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="label">연락처 <span className="font-normal">(비공개)</span></label>
            <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="010-0000-0000" />
          </div>

          <div>
            <label className="label">시작 일시 *</label>
            <div className="flex gap-1">
              <input className="input" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
              <select className="input w-28!" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {!START_TIMES.includes(startTime) && <option value={startTime}>{startTime}</option>}
                {START_TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">종료 일시 * <span className="font-normal">(다음날 가능)</span></label>
            <div className="flex gap-1">
              <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              <select className="input w-28!" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                {!END_TIMES.includes(endTime) && <option value={endTime}>{endTime}</option>}
                {END_TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {startIso && endIso && endIso > startIso && (
              <p className="mt-1 text-sm text-muted">{fmtDateKo(startIso)} {fmtRange(startIso, endIso)}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label">메모 <span className="font-normal">(비공개)</span></label>
            <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          {!editing && (
            <div className="sm:col-span-2 rounded-lg border border-line p-3">
              <label className="flex items-center gap-2 text-base font-semibold">
                <input type="checkbox" checked={repeat} onChange={(e) => { setRepeat(e.target.checked); setPreview(null); }} />
                매주 같은 요일·시간으로 반복
              </label>
              {repeat && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-base">
                    <label className="flex items-center gap-1 whitespace-nowrap">
                      <input type="radio" checked={repeatMode === "count"} onChange={() => setRepeatMode("count")} />
                      <input className="input w-20!" type="number" min={2} max={104} value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} disabled={repeatMode !== "count"} /> 주 동안
                    </label>
                    <label className="flex items-center gap-1 whitespace-nowrap">
                      <input type="radio" checked={repeatMode === "until"} onChange={() => setRepeatMode("until")} />
                      <input className="input w-auto!" type="date" value={repeatUntil} min={startDate} onChange={(e) => setRepeatUntil(e.target.value)} disabled={repeatMode !== "until"} /> 까지
                    </label>
                    <span className="text-muted">총 {count}회</span>
                    <button className="btn btn-sm ml-auto" onClick={doPreview} disabled={pending || !roomId || count < 1 || !startIso || !endIso}>
                      충돌 미리보기
                    </button>
                  </div>
                  {preview && (
                    <div className="max-h-48 overflow-y-auto rounded border border-line">
                      <table className="table text-sm">
                        <thead><tr><th>회차</th><th>날짜</th><th>시간</th><th>상태</th></tr></thead>
                        <tbody>
                          {preview.map((p) => (
                            <tr key={p.seq} className={p.conflict_id ? "bg-red-50" : ""}>
                              <td>{p.seq + 1}</td>
                              <td>{fmtDateKo(p.start_at)}</td>
                              <td className="tabular-nums">{fmtRange(p.start_at, p.end_at)}</td>
                              <td>{p.conflict_id ? <span className="text-danger">✕ &lsquo;{p.conflict_title}&rsquo; {fmtRange(p.conflict_start!, p.conflict_end!)}</span> : <span className="text-ok">○ 가능</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {preview && conflicts.length > 0 && (
                    <p className="text-sm text-danger">충돌 {conflicts.length}건은 제외하고 나머지 {preview.length - conflicts.length}건만 등록됩니다.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {isRecurringEdit && (
            <div className="sm:col-span-2 rounded-lg border border-line p-3 text-base">
              <p className="mb-1 font-semibold">반복 예약입니다. 어디까지 수정할까요?</p>
              <label className="mr-4 inline-flex items-center gap-1"><input type="radio" checked={scope === "one"} onChange={() => setScope("one")} /> 이 건만</label>
              <label className="inline-flex items-center gap-1"><input type="radio" checked={scope === "following"} onChange={() => setScope("following")} /> 이후 전체 (이 회차부터)</label>
              {scope === "following" && <p className="mt-1 text-sm text-muted">이후 회차는 같은 내용으로 바뀌고, 시간은 이 회차를 옮긴 만큼 함께 이동합니다. 장소는 바꿀 수 없습니다.</p>}
            </div>
          )}
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={pending}>취소</button>
          <button
            className="btn btn-primary"
            onClick={() => submit(true)}
            disabled={pending || (repeat && !editing && count > 1 && !preview)}
            title={repeat && !editing && count > 1 && !preview ? "먼저 충돌 미리보기를 눌러 주세요" : undefined}
          >
            {pending ? "저장 중…" : editing ? "수정 저장" : repeat && count > 1 ? `${count - conflicts.length}건 등록` : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useMemo, useState, useTransition } from "react";
import {
  createRecurring,
  createReservation,
  createReservationsMulti,
  findBusyRoomIds,
  previewRecurring,
  updateReservation,
  type PreviewRow,
  type ReservationInput,
} from "@/lib/actions/reservations";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { suggestRooms } from "@/lib/suggest";
import { addDaysToKey, countWeeklyUntil, fmtDateKo, fmtRange, fmtTime, seoulToUtc, toDateKey } from "@/lib/time";
import { FLOORS, FLOOR_LABEL, FLOOR_SHORT, type Reservation, type Room } from "@/lib/types";

export interface FormInitial {
  room_id?: string;
  dateKey: string;
  startTime?: string;
  endTime?: string;
  /** 이 예약의 내용·시간을 그대로 가져와 dateKey 날짜에 새로 등록 (예약 복사) */
  copyFrom?: Reservation;
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 5분 단위

/** 시·분을 따로 고르는 시각 선택 (5분 단위). allow24 면 종료용으로 24:00 까지 */
function TimeSelect({ value, onChange, allow24 }: { value: string; onChange: (v: string) => void; allow24?: boolean }) {
  const [h, m] = value.split(":");
  const hours = allow24 ? [...HOURS, "24"] : HOURS;
  const minutes = h === "24" ? ["00"] : MINUTES;
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <select className="input w-[4.5rem]!" value={h} aria-label="시" onChange={(e) => onChange(`${e.target.value}:${e.target.value === "24" ? "00" : m}`)}>
        {hours.map((x) => <option key={x} value={x}>{x}시</option>)}
      </select>
      <select className="input w-[4.5rem]!" value={m} aria-label="분" onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {!minutes.includes(m) && <option value={m}>{m}분</option>}
        {minutes.map((x) => <option key={x} value={x}>{x}분</option>)}
      </select>
    </div>
  );
}

/** 두 날짜 키 사이의 일수 (b - a) */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

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
  // 수정이면 그 예약, 복사면 원본 예약에서 내용을 가져온다
  const src = editing ?? initial.copyFrom ?? null;
  const copy = !editing && initial.copyFrom ? initial.copyFrom : null;
  const endInit = src ? splitEnd(src.end_at) : null;
  // 복사: 날짜만 dateKey 로 옮기고 시작~종료 날짜 간격(자정 넘김 등)은 그대로
  const copySpan = copy && endInit ? daysBetween(toDateKey(copy.start_at), endInit.date) : 0;
  const [roomId, setRoomId] = useState(editing?.room_id ?? initial.room_id ?? "");
  const [title, setTitle] = useState(src?.title ?? "");
  const [department, setDepartment] = useState(src?.department ?? "");
  const [contactName, setContactName] = useState(src?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(src?.contact_phone ?? "");
  const [attendees, setAttendees] = useState(src?.attendees?.toString() ?? "");
  const [memo, setMemo] = useState(src?.memo ?? "");
  const [startDate, setStartDate] = useState(editing ? toDateKey(editing.start_at) : initial.dateKey);
  const [startTime, setStartTime] = useState(src ? fmtTime(src.start_at) : initial.startTime ?? "10:00");
  const [endDate, setEndDate] = useState(editing ? endInit!.date : addDaysToKey(initial.dateKey, copySpan));
  const [endTime, setEndTime] = useState(endInit?.time ?? initial.endTime ?? "12:00");

  // 여러 장소 한꺼번에 (새 예약에서만, 반복과는 같이 쓰지 않음)
  const [multi, setMulti] = useState(false);
  const [extraRoomIds, setExtraRoomIds] = useState<string[]>([]);
  // 시간이 겹쳐 거절됐을 때 추천하는 빈 장소
  const [alternatives, setAlternatives] = useState<Room[] | null>(null);

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

  const multiRooms = multi && !editing ? Array.from(new Set([roomId, ...extraRoomIds].filter(Boolean))) : [];

  /** 겹침으로 거절되면 같은 시간에 빈 장소를 찾아 보여 준다 */
  const fail = async (r: { error: string; conflict?: boolean }) => {
    setError(r.error);
    if (!r.conflict || multiRooms.length > 1 || !startIso || !endIso) return;
    const busy = await findBusyRoomIds(startIso, endIso, editing?.id);
    if (busy.ok) setAlternatives(suggestRooms(rooms, new Set(busy.data), { current: room, attendees: attendeesNum }));
  };

  const submit = (skipConflicts = true) =>
    start(async () => {
      setError(null);
      setAlternatives(null);
      if (!roomId) return setError("장소를 선택해 주세요.");
      if (editing) {
        const r = await updateReservation(editing.id, buildInput(), isRecurringEdit ? scope : "one");
        if (!r.ok) return fail(r);
        onSaved(scope === "following" && isRecurringEdit ? `이후 회차 ${r.data.count}건을 수정했습니다.` : "예약을 수정했습니다.");
        return;
      }
      if (repeat && count > 1) {
        const r = await createRecurring(buildInput(), count, skipConflicts);
        if (!r.ok) return setError(r.error);
        onSaved(`반복 예약 ${r.data.created}건을 등록했습니다.${r.data.skipped.length ? ` (충돌 ${r.data.skipped.length}건 제외)` : ""}`);
        return;
      }
      if (multiRooms.length > 1) {
        const r = await createReservationsMulti(buildInput(), multiRooms);
        if (!r.ok) return fail(r);
        onSaved(`${r.data.created}곳에 예약을 등록했습니다.`);
        return;
      }
      const r = await createReservation(buildInput());
      if (!r.ok) return fail(r);
      onSaved("예약을 등록했습니다.");
    });

  const conflicts = preview?.filter((p) => p.conflict_id) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="card max-h-[95vh] w-full max-w-2xl overflow-y-auto p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{editing ? "예약 수정" : copy ? "예약 복사" : "새 예약"}</h2>
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
            {copy && (
              <p className="mt-1 text-sm text-muted">
                &lsquo;{copy.title}&rsquo; ({fmtDateKo(copy.start_at)}) 내용을 가져왔어요. 날짜·장소를 확인하고 등록하세요.
              </p>
            )}
            {!editing && !repeat && (
              <div className="mt-2 rounded-lg border border-line p-2">
                <label className="flex items-center gap-2 text-base font-semibold">
                  <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
                  여러 장소 한꺼번에 예약 <span className="text-sm font-normal text-muted">(수련회·절기 행사 등)</span>
                </label>
                {multi && (
                  <div className="mt-2 space-y-1">
                    {FLOORS.map((f) => {
                      const list = rooms.filter((r) => r.floor === f);
                      if (list.length === 0) return null;
                      return (
                        <div key={f} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="w-8 shrink-0 font-bold" style={{ color: FLOOR_COLORS[f].text }}>{FLOOR_SHORT[f]}</span>
                          {list.map((r) => {
                            const checked = r.id === roomId || extraRoomIds.includes(r.id);
                            return (
                              <label key={r.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={r.id === roomId}
                                  onChange={(e) =>
                                    setExtraRoomIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))
                                  }
                                />
                                {r.name}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                    <p className="text-sm text-muted">
                      선택 {multiRooms.length}곳 · 같은 시간으로 한 번에 등록되고, 한 곳이라도 겹치면 아무것도 등록되지 않아요.
                    </p>
                  </div>
                )}
              </div>
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
              <input className="input min-w-0" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
              <TimeSelect value={startTime} onChange={setStartTime} />
            </div>
          </div>
          <div>
            <label className="label">종료 일시 * <span className="font-normal">(다음날 가능)</span></label>
            <div className="flex gap-1">
              <input className="input min-w-0" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              <TimeSelect value={endTime} onChange={setEndTime} allow24 />
            </div>
            {startIso && endIso && endIso > startIso && (
              <p className="mt-1 text-sm text-muted">{fmtDateKo(startIso)} {fmtRange(startIso, endIso)}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label">메모 <span className="font-normal">(비공개)</span></label>
            <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          {!editing && !multi && (
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
        {alternatives && (
          <div className="mt-2 rounded-lg border border-line p-3">
            {alternatives.length === 0 ? (
              <p className="text-sm text-muted">같은 시간에 비어 있는 다른 장소가 없습니다.</p>
            ) : (
              <>
                <p className="mb-2 text-sm font-semibold">같은 시간에 비어 있는 장소 — 누르면 장소가 바뀝니다</p>
                <div className="flex flex-wrap gap-2">
                  {alternatives.map((r) => (
                    <button
                      key={r.id}
                      className="btn btn-sm"
                      style={{ borderColor: FLOOR_COLORS[r.floor].border, color: FLOOR_COLORS[r.floor].text }}
                      onClick={() => {
                        setRoomId(r.id);
                        setExtraRoomIds((ids) => ids.filter((x) => x !== r.id));
                        setAlternatives(null);
                        setError(null);
                      }}
                    >
                      {FLOOR_SHORT[r.floor]} {r.name} · {r.capacity_text}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={pending}>취소</button>
          <button
            className="btn btn-primary"
            onClick={() => submit(true)}
            disabled={pending || (repeat && !editing && count > 1 && !preview)}
            title={repeat && !editing && count > 1 && !preview ? "먼저 충돌 미리보기를 눌러 주세요" : undefined}
          >
            {pending
              ? "저장 중…"
              : editing
                ? "수정 저장"
                : repeat && count > 1
                  ? `${count - conflicts.length}건 등록`
                  : multiRooms.length > 1
                    ? `${multiRooms.length}곳 등록`
                    : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

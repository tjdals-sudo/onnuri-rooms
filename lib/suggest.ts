/**
 * 예약이 겹쳐 거절됐을 때 "같은 시간에 비어 있는 다른 장소"를 추천한다 (순수 함수).
 *
 * 순서: 인원이 들어가는 방 → 원래 방과 좌석 형태가 같은 방 → 같은 층 → 수용 인원이 원래 방과 비슷한 방
 */
import type { Room } from "./types";

export interface SuggestOptions {
  /** 원래 고른 장소 (추천에서 빠지고, 비슷한 방을 고르는 기준이 됨) */
  current: Room | null;
  /** 예상 인원 (없으면 원래 방의 수용 인원을 기준으로) */
  attendees: number | null;
  limit?: number;
}

export function suggestRooms(rooms: Room[], busyRoomIds: Set<string>, opts: SuggestOptions): Room[] {
  const { current, attendees, limit = 5 } = opts;
  const need = attendees ?? null;
  const target = need ?? current?.capacity_num ?? null;

  const score = (r: Room): number[] => {
    const fits = need === null || r.capacity_num === null || r.capacity_num >= need ? 0 : 1;
    const sameSeating = current && r.seating_type === current.seating_type ? 0 : 1;
    const sameFloor = current && r.floor === current.floor ? 0 : 1;
    const capGap = target !== null && r.capacity_num !== null ? Math.abs(r.capacity_num - target) : 9999;
    return [fits, sameSeating, sameFloor, capGap, r.sort_order];
  };

  return rooms
    .filter((r) => r.is_active && r.id !== current?.id && !busyRoomIds.has(r.id))
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => {
      for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
      return 0;
    })
    .slice(0, limit)
    .map((x) => x.r);
}

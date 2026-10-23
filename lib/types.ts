export type Floor = "B1" | "1F" | "2F" | "3F" | "4F";
export const FLOORS: Floor[] = ["B1", "1F", "2F", "3F", "4F"];
export const FLOOR_LABEL: Record<Floor, string> = {
  B1: "지하 1층",
  "1F": "1층",
  "2F": "2층",
  "3F": "3층",
  "4F": "4층",
};
export const FLOOR_SHORT: Record<Floor, string> = {
  B1: "B1",
  "1F": "1층",
  "2F": "2층",
  "3F": "3층",
  "4F": "4층",
};

export type SeatingType = "의자" | "바닥" | "좌식+의자" | "밴드실";
export const SEATING_TYPES: SeatingType[] = ["의자", "바닥", "좌식+의자", "밴드실"];

export interface Room {
  id: string;
  floor: Floor;
  name: string;
  capacity_text: string;
  capacity_num: number | null;
  seating_type: SeatingType;
  note: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** 공개 뷰(reservations_public) 행 — 개인정보 없음 */
export interface PublicReservation {
  id: string;
  room_id: string;
  floor: Floor;
  room_name: string;
  seating_type: SeatingType;
  capacity_text: string;
  title: string;
  department: string;
  attendees: number | null;
  start_at: string;
  end_at: string;
  recurrence_group_id: string | null;
}

/** 관리자용 전체 행 */
export interface Reservation {
  id: string;
  room_id: string;
  title: string;
  department: string;
  contact_name: string;
  contact_phone: string;
  attendees: number | null;
  start_at: string;
  end_at: string;
  memo: string;
  recurrence_group_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Admin {
  user_id: string;
  login_id: string;
  display_name: string;
}

export interface AuditLog {
  id: number;
  admin_id: string | null;
  admin_login_id: string;
  action: "insert" | "update" | "delete";
  target_table: "reservations" | "rooms";
  target_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface LoginLog {
  id: number;
  admin_id: string;
  admin_login_id: string;
  event: "login" | "logout";
  created_at: string;
}

export interface SheetSyncStatus {
  target: string;
  status: "ok" | "error";
  error_message: string;
  synced_at: string;
}

/** 사용 부서 목록 */
export interface Department {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** 예약에 실제로 쓰인 부서 이름별 건수 (부서 정리용) */
export interface DepartmentUsage {
  department: string;
  reservation_count: number;
  sample_title: string;
  last_used: string;
}

/** 시간이 겹치는 기존 예약 (겹침 알림 팝업용) */
export interface ConflictInfo {
  id: string;
  floor: Floor;
  room_name: string;
  title: string;
  department: string;
  start_at: string;
  end_at: string;
}

/** 서버 액션 공통 결과 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; warning?: string }
  | {
      ok: false;
      error: string;
      /** 다른 예약과 시간이 겹쳐서 실패 (빈 장소 추천용) */
      conflict?: boolean;
      /** 겹치는 예약들 (어느 팀과 겹치는지 팝업으로 보여 줌) */
      conflicts?: ConflictInfo[];
    };

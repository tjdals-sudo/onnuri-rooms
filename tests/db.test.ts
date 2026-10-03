/**
 * 원격 Supabase(linked 프로젝트)에 대한 통합 테스트.
 * .env.local 의 TEST_ADMIN_LOGIN_ID / TEST_ADMIN_PASSWORD 가 있어야 실행된다.
 * 테스트 데이터는 2031년, 제목 '[TEST]' 접두사를 쓰고 끝나면 지운다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seoulToUtc } from "@/lib/time";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const loginId = process.env.TEST_ADMIN_LOGIN_ID;
const password = process.env.TEST_ADMIN_PASSWORD;
const domain = process.env.ADMIN_ID_DOMAIN || "onnuri-incheon.local";
const enabled = Boolean(url && key && loginId && password);

const D = (date: string, time: string) => seoulToUtc(date, time).toISOString();
const T = "[TEST] ";

describe.skipIf(!enabled)("DB 제약·트리거·RLS", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let roomId: string;
  let adminUserId: string;

  const cleanup = async () => {
    await admin.from("reservations").delete().like("title", `${T}%`);
  };

  beforeAll(async () => {
    admin = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.signInWithPassword({ email: `${loginId}@${domain}`, password: password! });
    if (error) throw error;
    adminUserId = data.user.id;
    const { data: rooms } = await admin.from("rooms").select("id").eq("is_active", true).order("sort_order").limit(1);
    roomId = rooms![0].id;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await admin.auth.signOut();
  });

  it("같은 장소 1분 겹침은 거부, 맞닿은 예약은 허용", async () => {
    const a = await admin.from("reservations").insert({ room_id: roomId, title: `${T}A`, start_at: D("2031-03-03", "10:00"), end_at: D("2031-03-03", "12:00") }).select("id").single();
    expect(a.error).toBeNull();

    const b = await admin.from("reservations").insert({ room_id: roomId, title: `${T}B`, start_at: D("2031-03-03", "11:59"), end_at: D("2031-03-03", "13:00") });
    expect(b.error?.code).toBe("23P01");

    const c = await admin.from("reservations").insert({ room_id: roomId, title: `${T}C`, start_at: D("2031-03-03", "12:00"), end_at: D("2031-03-03", "13:00") });
    expect(c.error).toBeNull();

    const conflicts = await admin.rpc("find_conflicts", { p_room_id: roomId, p_start: D("2031-03-03", "11:00"), p_end: D("2031-03-03", "11:30"), p_exclude_id: null });
    expect(conflicts.data).toHaveLength(1);
    expect(conflicts.data![0].title).toBe(`${T}A`);
  });

  it("자정을 넘기는 예약과 다음날 새벽 예약이 충돌한다", async () => {
    const night = await admin.from("reservations").insert({ room_id: roomId, title: `${T}밤샘`, start_at: D("2031-03-05", "22:00"), end_at: D("2031-03-06", "02:00") });
    expect(night.error).toBeNull();

    const dawn = await admin.from("reservations").insert({ room_id: roomId, title: `${T}새벽`, start_at: D("2031-03-06", "00:30"), end_at: D("2031-03-06", "01:00") });
    expect(dawn.error?.code).toBe("23P01");

    // 공개 뷰에서 양쪽 날짜 모두 조회된다
    const day1 = await anon.from("reservations_public").select("title").lt("start_at", D("2031-03-06", "00:00")).gt("end_at", D("2031-03-05", "00:00")).like("title", `${T}%`);
    const day2 = await anon.from("reservations_public").select("title").lt("start_at", D("2031-03-07", "00:00")).gt("end_at", D("2031-03-06", "00:00")).like("title", `${T}%`);
    expect(day1.data?.map((r) => r.title)).toContain(`${T}밤샘`);
    expect(day2.data?.map((r) => r.title)).toContain(`${T}밤샘`);
  });

  it("반복 예약: 충돌 회차만 미리보기에 표시되고, 건너뛰고 등록된다", async () => {
    // 2주차(3/17)에 미리 다른 예약
    await admin.from("reservations").insert({ room_id: roomId, title: `${T}선점`, start_at: D("2031-03-17", "19:30"), end_at: D("2031-03-17", "20:30") });

    const preview = await admin.rpc("preview_recurring", { p_room_id: roomId, p_start: D("2031-03-10", "19:00"), p_end: D("2031-03-10", "21:00"), p_count: 4 });
    expect(preview.error).toBeNull();
    expect(preview.data).toHaveLength(4);
    expect(preview.data!.filter((p: { conflict_id: string | null }) => p.conflict_id).map((p: { seq: number }) => p.seq)).toEqual([1]);

    const created = await admin.rpc("create_recurring", {
      p_room_id: roomId, p_title: `${T}반복`, p_department: "청년부", p_contact_name: "", p_contact_phone: "", p_attendees: 10, p_memo: "",
      p_start: D("2031-03-10", "19:00"), p_end: D("2031-03-10", "21:00"), p_count: 4, p_skip_conflicts: true,
    });
    expect(created.error).toBeNull();
    const row = created.data![0];
    expect(row.created_ids).toHaveLength(3);
    expect(row.skipped_seqs).toEqual([1]);

    // 이후 전체 수정: 2회차(3/24)부터 1시간 뒤로
    const { data: third } = await admin.from("reservations").select("id").eq("recurrence_group_id", row.group_id).eq("start_at", D("2031-03-24", "19:00")).single();
    const upd = await admin.rpc("update_recurring_from", {
      p_id: third!.id, p_title: `${T}반복(수정)`, p_department: "청년부", p_contact_name: "", p_contact_phone: "", p_attendees: 12, p_memo: "",
      p_start: D("2031-03-24", "20:00"), p_end: D("2031-03-24", "22:00"),
    });
    expect(upd.error).toBeNull();
    expect(upd.data).toBe(2);
    const { data: after } = await admin.from("reservations").select("title, start_at").eq("recurrence_group_id", row.group_id).order("start_at");
    expect(after!.map((r) => r.title)).toEqual([`${T}반복`, `${T}반복(수정)`, `${T}반복(수정)`]);
    expect(new Date(after![2].start_at).toISOString()).toBe(D("2031-03-31", "20:00"));

    // 이후 전체 삭제
    const del = await admin.rpc("delete_recurring_from", { p_id: third!.id });
    expect(del.data).toBe(2);
    const { count } = await admin.from("reservations").select("id", { count: "exact", head: true }).eq("recurrence_group_id", row.group_id);
    expect(count).toBe(1);
  });

  it("변경 이력이 트리거로 빠짐없이 기록되고 수정·삭제할 수 없다", async () => {
    const { data: r } = await admin.from("reservations").insert({ room_id: roomId, title: `${T}이력`, start_at: D("2031-04-01", "09:00"), end_at: D("2031-04-01", "10:00") }).select("id, created_by, updated_by").single();
    expect(r!.created_by).toBe(adminUserId);
    await admin.from("reservations").update({ title: `${T}이력2` }).eq("id", r!.id);
    await admin.from("reservations").delete().eq("id", r!.id);

    const { data: logs } = await admin.from("audit_logs").select("*").eq("target_id", r!.id).order("id");
    expect(logs!.map((l) => l.action)).toEqual(["insert", "update", "delete"]);
    expect(logs!.every((l) => l.admin_login_id === loginId)).toBe(true);
    expect(logs![1].before_data.title).toBe(`${T}이력`);
    expect(logs![1].after_data.title).toBe(`${T}이력2`);

    const upd = await admin.from("audit_logs").update({ admin_login_id: "x" }).eq("id", logs![0].id).select();
    expect(upd.error ?? (upd.data?.length === 0 ? { message: "no rows" } : null)).not.toBeNull();
    const { data: still } = await admin.from("audit_logs").select("admin_login_id").eq("id", logs![0].id).single();
    expect(still!.admin_login_id).toBe(loginId);

    await admin.from("audit_logs").delete().eq("id", logs![0].id);
    const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("target_id", r!.id);
    expect(count).toBe(3);
  });

  it("장소 수정도 이력에 남는다", async () => {
    const { data: room } = await admin.from("rooms").select("id, note").eq("id", roomId).single();
    await admin.from("rooms").update({ note: `${T}메모` }).eq("id", roomId);
    await admin.from("rooms").update({ note: room!.note }).eq("id", roomId);
    const { data: logs } = await admin.from("audit_logs").select("action, target_table").eq("target_id", roomId).order("id", { ascending: false }).limit(2);
    expect(logs).toHaveLength(2);
    expect(logs!.every((l) => l.target_table === "rooms" && l.action === "update")).toBe(true);
  });

  it("비로그인은 원본 테이블을 못 보고 공개 뷰에는 개인정보 컬럼이 없다", async () => {
    const direct = await anon.from("reservations").select("*").like("title", `${T}%`);
    expect(direct.data ?? []).toHaveLength(0);

    const pub = await anon.from("reservations_public").select("*").like("title", `${T}%`).limit(1);
    expect(pub.error).toBeNull();
    expect(pub.data!.length).toBeGreaterThan(0);
    const keys = Object.keys(pub.data![0]);
    expect(keys).not.toContain("contact_phone");
    expect(keys).not.toContain("contact_name");
    expect(keys).not.toContain("memo");

    const write = await anon.from("reservations").insert({ room_id: roomId, title: `${T}anon`, start_at: D("2031-05-01", "09:00"), end_at: D("2031-05-01", "10:00") });
    expect(write.error).not.toBeNull();

    const audit = await anon.from("audit_logs").select("id").limit(1);
    expect(audit.data ?? []).toHaveLength(0);
  });

  it("접속 기록은 본인 것만 넣을 수 있고 수정할 수 없다", async () => {
    const ins = await admin.from("login_logs").insert({ admin_id: adminUserId, admin_login_id: loginId, event: "login" }).select("id").single();
    expect(ins.error).toBeNull();
    // UPDATE 정책이 없어 0행이 바뀌거나(에러 없음), 바뀌려 해도 트리거가 막는다 — 어느 쪽이든 값은 그대로
    const upd = await admin.from("login_logs").update({ event: "logout" }).eq("id", ins.data!.id).select();
    expect(upd.error !== null || upd.data?.length === 0).toBe(true);
    const { data } = await admin.from("login_logs").select("event").eq("id", ins.data!.id).single();
    expect(data!.event).toBe("login");
    const del = await admin.from("login_logs").delete().eq("id", ins.data!.id).select();
    expect(del.error !== null || del.data?.length === 0).toBe(true);
  });

  it("예약이 바뀌면 공개 채널로 실시간 신호가 온다", async () => {
    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("15초 안에 실시간 메시지를 받지 못했습니다")), 15000);
      const ch = anon.channel("rooms-public", { config: { private: false } });
      ch.on("broadcast", { event: "change" }, (msg) => {
        clearTimeout(timer);
        resolve(msg.payload as Record<string, unknown>);
      }).subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await admin.from("reservations").insert({ room_id: roomId, title: `${T}실시간`, start_at: D("2031-06-01", "09:00"), end_at: D("2031-06-01", "10:00") });
        }
      });
    });
    const payload = await received;
    expect(payload.table).toBe("reservations");
    expect(payload.op).toBe("insert");
    expect(payload).not.toHaveProperty("contact_phone");
    await anon.removeAllChannels();
  });
});

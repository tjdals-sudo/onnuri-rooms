import { NextResponse, type NextRequest } from "next/server";
import { isSheetsConfigured, notifyOwner, syncAuditTab, syncMonths } from "@/lib/sheets";
import { getServiceSupabase } from "@/lib/supabase/server";
import { toMonthKey } from "@/lib/time";

/**
 * Vercel Cron (매일 KST 05:00) — Supabase 무료 프로젝트 일시정지 방지용 DB 핑 + 이번 달 시트 재동기화
 * + 문제가 남아 있으면 하루 한 번 알림 메일 (DB 접속 실패, 시트 동기화 실패가 계속되는 경우)
 * Vercel 은 CRON_SECRET 환경변수가 있으면 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 호출한다.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getServiceSupabase();
  const { count, error } = await sb.from("rooms").select("id", { count: "exact", head: true });
  if (error) {
    await notifyOwner("데이터베이스 접속 실패", `매일 새벽 점검에서 Supabase 에 접속하지 못했습니다.\n\n오류: ${error.message}\n\nSupabase 대시보드에서 프로젝트가 일시정지(Paused)되지 않았는지 확인해 주세요.`);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let sheets: unknown = "not configured";
  if (isSheetsConfigured()) {
    const failing = async () =>
      ((await sb.from("sheet_sync_status").select("target, error_message").eq("status", "error")).data ?? []) as {
        target: string;
        error_message: string;
      }[];
    const before = new Set((await failing()).map((e) => e.target));
    sheets = { months: await syncMonths([toMonthKey(new Date())]), audit: await syncAuditTab() };
    // 어제부터 계속 실패 중인 것만 하루 한 번 요약 메일 (새로 실패한 건은 그 순간 이미 알림이 감)
    const errs = (await failing()).filter((e) => before.has(e.target));
    if (errs.length > 0) {
      await notifyOwner(
        `시트 동기화 실패가 아직 ${errs.length}건 남아 있음`,
        errs.map((e) => `- ${e.target}: ${e.error_message}`).join("\n") + "\n\n관리자 화면의 '시트 다시 동기화'를 눌러 주세요.",
      );
    }
  }
  return NextResponse.json({ ok: true, rooms: count, sheets, at: new Date().toISOString() });
}

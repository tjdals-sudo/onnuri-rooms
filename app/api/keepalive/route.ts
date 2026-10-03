import { NextResponse, type NextRequest } from "next/server";
import { isSheetsConfigured, syncAuditTab, syncMonths } from "@/lib/sheets";
import { getServiceSupabase } from "@/lib/supabase/server";
import { toMonthKey } from "@/lib/time";

/**
 * Vercel Cron (매일 KST 05:00) — Supabase 무료 프로젝트 일시정지 방지용 DB 핑 + 이번 달 시트 재동기화
 * Vercel 은 CRON_SECRET 환경변수가 있으면 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 호출한다.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getServiceSupabase();
  const { count, error } = await sb.from("rooms").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let sheets: unknown = "not configured";
  if (isSheetsConfigured()) {
    sheets = { months: await syncMonths([toMonthKey(new Date())]), audit: await syncAuditTab() };
  }
  return NextResponse.json({ ok: true, rooms: count, sheets, at: new Date().toISOString() });
}

"use server";
import { getCurrentAdmin } from "@/lib/supabase/server";
import { isSheetsConfigured, syncAuditTab, syncMonths } from "@/lib/sheets";
import { addMonthsToKey, toMonthKey } from "@/lib/time";
import type { ActionResult } from "@/lib/types";

/** 관리자 버튼: 지난달·이번달·다음달 + 변경이력 탭을 DB 기준으로 다시 쓴다 */
export async function resyncSheets(): Promise<ActionResult<{ synced: string[] }>> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: "로그인이 필요합니다." };
  if (!isSheetsConfigured()) return { ok: false, error: "Google 스프레드시트 환경변수가 설정되지 않았습니다." };
  const cur = toMonthKey(new Date());
  const months = [addMonthsToKey(cur, -1), cur, addMonthsToKey(cur, 1)];
  const results = await syncMonths(months);
  const audit = await syncAuditTab();
  const failed = [...results.filter((r) => !r.ok), ...(audit.ok ? [] : [audit])];
  if (failed.length > 0) return { ok: false, error: failed.map((f) => `${f.target}: ${f.error}`).join(" / ") };
  return { ok: true, data: { synced: [...months, "변경이력"] } };
}

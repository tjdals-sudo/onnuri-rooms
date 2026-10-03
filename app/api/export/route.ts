import { NextResponse, type NextRequest } from "next/server";
import { buildMonthWorkbook } from "@/lib/excel";
import { getCurrentAdmin, getServerSupabase } from "@/lib/supabase/server";
import { toMonthKey } from "@/lib/time";

/** GET /api/export?month=YYYY-MM — 관리자만, 해당 월 예약 .xlsx */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month") || toMonthKey(new Date());
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month 형식은 YYYY-MM" }, { status: 400 });

  const sb = await getServerSupabase();
  const buf = await buildMonthWorkbook(sb, month);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="onnuri-rooms-${month}.xlsx"`,
    },
  });
}

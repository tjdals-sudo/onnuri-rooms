import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FLOOR_COLORS } from "./floor-colors";
import { SHEET_HEADERS, fetchMonthRows } from "./report-data";

function toArgb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

/** 월별 예약 .xlsx (백업용) — 구글 시트와 같은 컬럼 */
export async function buildMonthWorkbook(sb: SupabaseClient, monthKey: string): Promise<Buffer> {
  const rows = await fetchMonthRows(sb, monthKey);
  const wb = new ExcelJS.Workbook();
  wb.creator = "인천 온누리교회 장소 사용 현황";
  const ws = wb.addWorksheet(monthKey, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = SHEET_HEADERS.map((h) => ({ header: h, key: h, width: h === "메모" || h === "행사명" ? 28 : 13 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3ECE2" } };
  for (const r of rows) {
    const row = ws.addRow(r.values);
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(FLOOR_COLORS[r.floor].soft) } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

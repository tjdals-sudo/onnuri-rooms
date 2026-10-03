/**
 * Google 스프레드시트 동기화 (서버 전용)
 * - 월 탭(YYYY-MM)을 DB 기준으로 전체 재작성 → 시트와 DB 가 어긋나지 않음
 * - '변경이력' 탭도 전체 재작성
 * - 결과를 sheet_sync_status 에 기록 (관리자 화면 배너용)
 */
import { google, type sheets_v4 } from "googleapis";
import { FLOOR_COLORS } from "./floor-colors";
import { AUDIT_HEADERS, SHEET_HEADERS, fetchAuditRows, fetchMonthRows } from "./report-data";
import { getServiceSupabase } from "./supabase/server";

export interface SyncResult {
  target: string;
  ok: boolean;
  error?: string;
}

const AUDIT_TAB = "변경이력";

/** 어느 방식이 설정돼 있는지: Apps Script 웹 앱이 우선, 없으면 서비스 계정 */
export function sheetsMode(): "apps-script" | "service-account" | null {
  if (process.env.GOOGLE_APPS_SCRIPT_URL && process.env.GOOGLE_APPS_SCRIPT_SECRET) return "apps-script";
  if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) return "service-account";
  return null;
}

export function isSheetsConfigured(): boolean {
  return sheetsMode() !== null;
}

interface TabPayload {
  title: string;
  headers: readonly string[];
  rows: string[][];
  /** 행별 배경색 hex (예: "#dff1e5") */
  rowColors?: string[];
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const h = hex.replace("#", "");
  return { red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 };
}

/** Apps Script 웹 앱에 탭 데이터를 POST (스크립트가 탭을 통째로 다시 씀) */
async function postToAppsScript(tabs: TabPayload[]): Promise<void> {
  const res = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.GOOGLE_APPS_SCRIPT_SECRET, tabs }),
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let parsed: { ok?: boolean; error?: string } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script 응답을 해석할 수 없습니다 (HTTP ${res.status}). 웹 앱 배포의 "액세스 권한"이 "모든 사용자"인지 확인하세요.`);
  }
  if (!res.ok || !parsed.ok) throw new Error(parsed.error || `Apps Script 오류 (HTTP ${res.status})`);
}

/** 방식에 따라 탭 하나를 다시 쓴다 */
async function writeTabAny(tab: TabPayload): Promise<void> {
  if (sheetsMode() === "apps-script") {
    await postToAppsScript([tab]);
    return;
  }
  const sheets = getSheetsClient();
  await writeTab(sheets, process.env.GOOGLE_SHEET_ID!, tab.title, tab.headers, tab.rows, tab.rowColors?.map(hexToRgb));
}

function getSheetsClient(): sheets_v4.Sheets {
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!, "base64").toString("utf8");
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureTab(sheets: sheets_v4.Sheets, spreadsheetId: string, title: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const found = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (found?.properties?.sheetId !== undefined && found.properties.sheetId !== null) return found.properties.sheetId;
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  const id = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (id === undefined || id === null) throw new Error(`탭 생성 실패: ${title}`);
  return id;
}

async function writeTab(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
  headers: readonly string[],
  rows: string[][],
  rowColors?: { red: number; green: number; blue: number }[],
) {
  const sheetId = await ensureTab(sheets, spreadsheetId, title);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${title}'` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...headers], ...rows] },
  });

  const requests: sheets_v4.Schema$Request[] = [
    // 헤더 고정 + 굵게 + 배경
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { backgroundColor: { red: 0.95, green: 0.92, blue: 0.87 }, textFormat: { bold: true }, horizontalAlignment: "CENTER" } },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
      },
    },
    // 본문 배경 초기화 (지난 동기화의 색 제거)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { bold: false } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length } } },
  ];

  // 층별 행 색 — 같은 색이 이어지는 구간을 묶어서 요청 수를 줄인다
  if (rowColors && rowColors.length > 0) {
    let i = 0;
    while (i < rowColors.length) {
      let j = i;
      while (j + 1 < rowColors.length && rowColors[j + 1].red === rowColors[i].red && rowColors[j + 1].green === rowColors[i].green && rowColors[j + 1].blue === rowColors[i].blue) j++;
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: i + 1, endRowIndex: j + 2, startColumnIndex: 0, endColumnIndex: headers.length },
          cell: { userEnteredFormat: { backgroundColor: rowColors[i] } },
          fields: "userEnteredFormat.backgroundColor",
        },
      });
      i = j + 1;
    }
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

async function recordStatus(target: string, ok: boolean, error?: string) {
  try {
    const sb = getServiceSupabase();
    await sb.from("sheet_sync_status").upsert({ target, status: ok ? "ok" : "error", error_message: error ?? "", synced_at: new Date().toISOString() });
  } catch (e) {
    console.error("sheet_sync_status 기록 실패", e);
  }
}

/** 월 탭들을 DB 기준으로 다시 쓴다 */
export async function syncMonths(months: string[]): Promise<SyncResult[]> {
  if (!isSheetsConfigured()) return months.map((m) => ({ target: m, ok: true }));
  const results: SyncResult[] = [];
  const sb = getServiceSupabase();
  for (const month of months) {
    try {
      const rows = await fetchMonthRows(sb, month);
      await writeTabAny({
        title: month,
        headers: SHEET_HEADERS,
        rows: rows.map((r) => r.values),
        rowColors: rows.map((r) => FLOOR_COLORS[r.floor].soft),
      });
      await recordStatus(month, true);
      results.push({ target: month, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[sheets] ${month} 동기화 실패:`, msg);
      await recordStatus(month, false, msg);
      results.push({ target: month, ok: false, error: msg });
    }
  }
  return results;
}

/** 변경이력 탭 */
export async function syncAuditTab(): Promise<SyncResult> {
  if (!isSheetsConfigured()) return { target: AUDIT_TAB, ok: true };
  try {
    const rows = await fetchAuditRows(getServiceSupabase());
    await writeTabAny({ title: AUDIT_TAB, headers: AUDIT_HEADERS, rows });
    await recordStatus("audit", true);
    return { target: AUDIT_TAB, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sheets] 변경이력 동기화 실패:", msg);
    await recordStatus("audit", false, msg);
    return { target: AUDIT_TAB, ok: false, error: msg };
  }
}

/** 예약·장소 변경 뒤 호출: 영향받은 월 + 변경이력 */
export async function syncAfterChange(months: string[]): Promise<void> {
  if (!isSheetsConfigured()) return;
  await syncMonths(months);
  await syncAuditTab();
}

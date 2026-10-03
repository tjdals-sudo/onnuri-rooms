/**
 * 인천 온누리교회 장소 사용 현황 — 구글 스프레드시트 수신용 Apps Script
 *
 * 설치 방법 (README "5-B. Apps Script 방식" 참고)
 *  1. 스프레드시트 메뉴 확장 프로그램 → Apps Script → 기존 내용을 지우고 이 파일 전체를 붙여 넣기
 *  2. 저장(⌘S) → 오른쪽 위 "배포" → "새 배포" → 유형 "웹 앱"
 *     - 설명: 아무거나 / 다음 사용자 인증 정보로 실행: "나" / 액세스 권한: "모든 사용자"
 *  3. "배포" → 권한 허용(처음 한 번) → 나온 "웹 앱 URL" 을 복사해서 전달
 *
 * 서버(Vercel)가 아래 SECRET 과 함께 JSON 을 POST 하면 해당 탭을 통째로 다시 씁니다.
 * SECRET 은 서버 환경변수 GOOGLE_APPS_SCRIPT_SECRET 과 같아야 합니다.
 */
var SECRET = "P2GWdotavKRd6TnIKPbLqulv9GHDBhdY";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!SECRET || body.secret !== SECRET) {
      return respond({ ok: false, error: "unauthorized" });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var written = [];
    (body.tabs || []).forEach(function (tab) {
      writeTab(ss, tab);
      written.push(tab.title);
    });
    return respond({ ok: true, written: written });
  } catch (err) {
    return respond({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** 브라우저로 URL 을 열었을 때 살아 있는지 확인용 */
function doGet() {
  return respond({ ok: true, message: "onnuri-rooms sheet receiver is ready" });
}

/**
 * tab = { title, headers: string[], rows: string[][], rowColors?: string[] (행별 배경 hex) }
 * 탭 전체를 지우고 다시 씁니다(헤더 고정·굵게, 층별 행 색, 열 너비 자동).
 */
function writeTab(ss, tab) {
  var sheet = ss.getSheetByName(tab.title) || ss.insertSheet(tab.title);
  sheet.clear();
  var nCols = tab.headers.length;
  var values = [tab.headers].concat(tab.rows || []);
  sheet.getRange(1, 1, values.length, nCols).setValues(values);
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, nCols)
    .setFontWeight("bold")
    .setBackground("#f3ece2")
    .setHorizontalAlignment("center");
  if (tab.rows && tab.rows.length && tab.rowColors && tab.rowColors.length === tab.rows.length) {
    var backgrounds = tab.rowColors.map(function (c) {
      var row = [];
      for (var i = 0; i < nCols; i++) row.push(c);
      return row;
    });
    sheet.getRange(2, 1, tab.rows.length, nCols).setBackgrounds(backgrounds);
  }
  // 남는 빈 행 정리 (최소 50행은 남겨 둠)
  var maxRows = sheet.getMaxRows();
  var keep = Math.max(values.length + 5, 50);
  if (maxRows > keep) sheet.deleteRows(keep + 1, maxRows - keep);
  for (var c = 1; c <= nCols; c++) sheet.autoResizeColumn(c);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

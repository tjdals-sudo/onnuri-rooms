/**
 * 월간 현황표를 A4 가로 한 장에 맞춘다.
 * 인쇄 직전(beforeprint)에 화면을 잠깐 인쇄 모양(html.print-measure → print: 스타일 적용)으로 바꿔
 * 높이를 재고, 넘치면 --print-zoom 으로 줄인다. 실제 축소는 @media print 에서만 적용된다.
 */
const PAGE_W_MM = 297 - 20; // A4 가로 - 여백 10mm × 2 (globals.css 의 @page 와 맞출 것)
const PAGE_H_MM = 210 - 20 - 3; // 반올림 오차로 두 장이 되지 않게 3mm 여유

export function fitPrintArea() {
  const root = document.documentElement;
  root.style.removeProperty("--print-zoom");
  const area = document.getElementById("print-area");
  if (!area) return;

  const mm = mmToPx();
  root.classList.add("print-measure");
  area.style.width = `${PAGE_W_MM * mm}px`;
  const h = area.scrollHeight;
  area.style.width = "";
  root.classList.remove("print-measure");

  // 줄인 만큼 폭이 넓어져 줄바꿈이 줄어드니, 이 배율이면 항상 한 장 안에 들어간다
  const zoom = Math.min(1, (PAGE_H_MM * mm) / h);
  if (zoom < 1) root.style.setProperty("--print-zoom", zoom.toFixed(3));
}

function mmToPx() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:100mm";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return px;
}

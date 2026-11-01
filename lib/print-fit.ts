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
  const pageH = PAGE_H_MM * mm;
  // zoom 배율로 줄였을 때 종이 위 높이. 줄이면 폭이 1/zoom 만큼 넓어져 줄바꿈이 줄어든다.
  // 작은 글씨는 줄바꿈이 배율대로 줄지 않으니, 인쇄와 똑같이 zoom 을 걸어 놓고 잰다
  const heightAt = (zoom: number) => {
    area.style.zoom = String(zoom);
    area.style.width = `${(PAGE_W_MM * mm) / zoom}px`;
    return area.getBoundingClientRect().height;
  };

  root.classList.add("print-measure");
  let zoom = 1;
  const h = heightAt(1);
  if (h > pageH) {
    // 원래 폭 기준 배율이면 항상 들어간다. 다만 넓어진 폭에서 줄바꿈이 없어져
    // 종이 아래가 크게 비고 글씨만 작아지므로, 한 장에 들어가는 가장 큰 배율을 찾는다
    let lo = pageH / h;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (heightAt(mid) <= pageH) lo = mid;
      else hi = mid;
    }
    zoom = lo;
  }
  area.style.zoom = "";
  area.style.width = "";
  root.classList.remove("print-measure");

  if (zoom < 1) root.style.setProperty("--print-zoom", (Math.floor(zoom * 1000) / 1000).toFixed(3));
}

function mmToPx() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:100mm";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return px;
}

import type { Floor } from "./types";

/** 층별 색 — 화면과 구글 시트(soft)가 같은 팔레트를 쓴다 (텍스트 대비 4.5:1 이상) */
export const FLOOR_COLORS: Record<Floor, { bg: string; soft: string; text: string; border: string }> = {
  B1: { bg: "#5b5a8a", soft: "#e8e7f3", text: "#2e2d52", border: "#8b8ab8" },
  "1F": { bg: "#2f7d4f", soft: "#dff1e5", text: "#1c4a2f", border: "#6fb08a" },
  "2F": { bg: "#c56a1f", soft: "#fbe8d6", text: "#6e3a0f", border: "#e5a66d" },
  "3F": { bg: "#2c6fb0", soft: "#dde9f6", text: "#1a4470", border: "#7ea9d8" },
  "4F": { bg: "#9a3d6c", soft: "#f5e0ec", text: "#5c2340", border: "#c784a7" },
};

// 원본 + 가공 결과를 합쳐 사이트·뉴스레터가 공통으로 쓰는 항목 목록을 만든다.
import { CATEGORIES, PATHS, readJson, todayKST } from "./config.js";

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function daysUntil(dateStr, today = todayKST()) {
  if (!dateStr) return null;
  return Math.round((Date.parse(dateStr) - Date.parse(today)) / 86400e3);
}

export function ddayLabel(item) {
  if (item.always_open) return "상시";
  if (item.dday === null) return "기한 확인";
  if (item.dday < 0) return "마감";
  if (item.dday === 0) return "D-Day";
  return `D-${item.dday}`;
}

// "20261110090000" / "2026-11-10 09:00:00" 등 → "2026-11-10"
export function ymd(v) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
}

export function loadItems() {
  const services = readJson(PATHS.raw, {});
  const enriched = readJson(PATHS.enriched, {});
  const today = todayKST();
  return Object.values(services)
    .filter((s) => enriched[s.서비스ID])
    .map((s) => {
      const e = enriched[s.서비스ID];
      return {
        id: s.서비스ID,
        slug: encodeURIComponent(String(s.서비스ID)),
        name: s.서비스명,
        org: s.소관기관명,
        raw: s,
        ...e,
        categoryName: CATEGORIES[e.category] || CATEGORIES.etc,
        dday: e.always_open ? null : daysUntil(e.deadline, today),
        registered: ymd(s.등록일시),
        updated: ymd(s.수정일시),
        views: Number(s.조회수 || 0),
        sample: Boolean(s._sample),
      };
    });
}

// 마감 임박: 오늘~within일 안에 마감, 가까운 순
export function closingSoon(items, within = 14) {
  return items.filter((i) => i.dday !== null && i.dday >= 0 && i.dday <= within).sort((a, b) => a.dday - b.dday);
}

// 최근 등록·수정: 최근 days일, 최신순
export function recent(items, days = 7, today = todayKST()) {
  const cutoff = Date.parse(today) - days * 86400e3;
  return items
    .filter((i) => Date.parse(i.registered || i.updated) >= cutoff && !(i.dday !== null && i.dday < 0))
    .sort((a, b) => (b.registered || b.updated).localeCompare(a.registered || a.updated));
}

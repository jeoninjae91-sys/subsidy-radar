// 비급여 진료비(예방접종 가격) 섹션 공통: 경로, 항목 정의, 데이터 로더, 통계
// 시험판: 항목 하나(대상포진 예방접종)만 전국 시군구로 발행해 검색 노출을 확인한다.
import path from "node:path";
import { ROOT, readJson } from "./config.js";

export const PRICE_PATHS = {
  data: path.join(ROOT, "data", "price.json"),
  fixture: path.join(ROOT, "fixtures", "sample-price.json"),
};

// 발행 항목. match: 심평원 비급여 항목명(npayKorNm)에서 이 항목에 속하는 코드를 고르는 정규식.
// 항목을 늘릴 때는 여기에 한 줄 추가하면 수집·발행이 같이 늘어난다.
export const ITEMS = {
  shingles: { name: "대상포진 예방접종", short: "대상포진", match: /대상포진/ },
};

// 시군구 단독 페이지를 만드는 최소 기관 수 (그보다 적으면 시도 페이지에만 싣는다)
export const MIN_SGGU_ROWS = 3;

// "예방접종료/대상포진/싱그릭스주" → "싱그릭스주" (항목명 끝 조각이 백신·세부 구분)
export function kindLabel(name, item) {
  const parts = String(name || "").split("/").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return !last || last === item.short || last === item.name ? "구분 없음" : last;
}

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

// 기관 한 곳의 대표 가격 = 신고한 최저 금액
export function stats(rows) {
  const p = rows.map((r) => r.min).filter((v) => v > 0);
  return p.length ? { n: new Set(rows.map((r) => r.y)).size, min: Math.min(...p), max: Math.max(...rows.map((r) => r.max || r.min)), mid: median(p) } : null;
}

// 실데이터가 없으면 샘플(fixtures)로 — 샘플은 미리보기 전용이고 실제 사이트에는 발행하지 않는다
export function loadPrice() {
  const real = readJson(PRICE_PATHS.data, null);
  if (real && Object.values(real.items || {}).some((it) => it.rows?.length)) return { ...real, sample: false };
  return { ...readJson(PRICE_PATHS.fixture, { items: {} }), sample: true };
}

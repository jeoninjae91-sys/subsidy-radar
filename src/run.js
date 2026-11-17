// 전체 파이프라인: 수집 → 가공 → 사이트 → (월요일이면) 뉴스레터
// 매일 1회 실행 권장. `node src/run.js --newsletter` 로 요일과 무관하게 뉴스레터 생성.
import { fetchServices } from "./fetch.js";
import { enrichAll } from "./enrich.js";
import { buildSite } from "./build.js";
import { buildNewsletter } from "./newsletter.js";
import { collect } from "./batch.js";
import { writeArticles } from "./articles.js";
import { buildGuides } from "./guides.js";
import path from "node:path";
import { ROOT, readJson } from "./config.js";

const t0 = Date.now();
const f = await fetchServices({ full: process.argv.includes("--full") });
console.log(`① 수집: 변경 ${f.added}건 / 전체 ${f.total}건${f.sample ? " (샘플)" : ""}`);

// 진행 중인 배치가 있으면 끝난 것부터 결과 반영
const hasPendingBatch = readJson(path.join(ROOT, "data", "batches.json"), []).some((b) => !b.collected);
if (hasPendingBatch && process.env.ANTHROPIC_API_KEY) await collect();

const e = await enrichAll();
console.log(`② 가공: ${e.processed}건 처리, ${e.failed}건 실패/대체`);

// 신청 가이드 글 자동 발행 (매일 ARTICLES_PER_DAY편) + 매월 1일 분야별 가이드 갱신
await writeArticles();
if (new Date(Date.now() + 9 * 3600e3).getUTCDate() === 1 && process.env.ANTHROPIC_API_KEY) await buildGuides({ refresh: true });

// 돌봄(장기요양기관) 수집 — 실패해도 지원금 사이트 발행은 계속한다
if (process.env.CARE_PUBLISH === "1") {
  try {
    const { fetchCare } = await import("./care-fetch.js");
    const c = await fetchCare();
    if (!c.skipped) console.log(`②-2 돌봄: 운영 중 ${c.total}곳 · 오늘 상세 ${c.done}곳 · 상세 대기 ${c.left}곳`);
  } catch (err) {
    console.log(`②-2 돌봄 수집 실패 (기존 데이터로 계속): ${err.message}`);
  }
}

// 예방접종 가격(비급여 진료비) 수집 — 주 1회만 다시 받고, 실패해도 발행은 계속한다
if (process.env.PRICE_PUBLISH === "1") {
  try {
    const { fetchPrice } = await import("./price-fetch.js");
    const p = await fetchPrice();
    if (p.fresh) console.log(`②-3 가격: ${p.fetchedAt} 수집분 사용`);
    else if (!p.skipped) console.log(`②-3 가격: ${Object.values(p.items).map((o) => `의료기관 ${o.hospitals}곳 · 가격 ${o.rows}건`).join(", ")}`);
  } catch (err) {
    console.log(`②-3 가격 수집 실패 (기존 데이터로 계속): ${err.message}`);
  }
}

const b = buildSite();
console.log(`③ 사이트: 페이지 ${b.pages}개 생성`);

const isMonday = new Date(Date.now() + 9 * 3600e3).getUTCDay() === 1;
if (isMonday || process.argv.includes("--newsletter")) {
  const n = buildNewsletter();
  console.log(`④ 뉴스레터: 마감임박 ${n.soon}건, 신규 ${n.fresh}건 → ${n.file}.html`);
}
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);

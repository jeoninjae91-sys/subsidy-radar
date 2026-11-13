// 전체 파이프라인: 수집 → 가공 → 사이트 → (월요일이면) 뉴스레터
// 매일 1회 실행 권장. `node src/run.js --newsletter` 로 요일과 무관하게 뉴스레터 생성.
import { fetchServices } from "./fetch.js";
import { enrichAll } from "./enrich.js";
import { buildSite } from "./build.js";
import { buildNewsletter } from "./newsletter.js";
import { collect } from "./batch.js";
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

const b = buildSite();
console.log(`③ 사이트: 페이지 ${b.pages}개 생성`);

const isMonday = new Date(Date.now() + 9 * 3600e3).getUTCDay() === 1;
if (isMonday || process.argv.includes("--newsletter")) {
  const n = buildNewsletter();
  console.log(`④ 뉴스레터: 마감임박 ${n.soon}건, 신규 ${n.fresh}건 → ${n.file}.html`);
}
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);

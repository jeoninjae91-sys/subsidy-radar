// 1단계: 수집
// 행정안전부_대한민국 공공서비스(혜택) 정보 API (data.go.kr 15113968)
// GET https://api.odcloud.kr/api/gov24/v3/serviceList
// 첫 실행은 전체, 이후에는 마지막 수집 이후 수정된 건만(cond[수정일시::GTE]) 가져온다.
import { CONFIG, PATHS, isMain, readJson, writeJson } from "./config.js";

const BASE = "https://api.odcloud.kr/api/gov24/v3/serviceList";
const PER_PAGE = 500;

async function fetchPage(page, sinceStr) {
  const url = new URL(BASE);
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(PER_PAGE));
  url.searchParams.set("returnType", "JSON");
  url.searchParams.set("serviceKey", CONFIG.dataKey);
  if (sinceStr) url.searchParams.set("cond[수정일시::GTE]", sinceStr);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(`인증 실패(${res.status}). DATA_GO_KR_KEY 와 활용신청 승인 여부를 확인하세요.\n${body.slice(0, 300)}`);
    }
    if (attempt === 3) throw new Error(`API 오류 ${res.status}: ${body.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

export async function fetchServices({ full = false } = {}) {
  const services = readJson(PATHS.raw, {});
  const state = readJson(PATHS.state, {});

  if (!CONFIG.dataKey) {
    console.log("[fetch] DATA_GO_KR_KEY 없음 → 샘플 데이터(fixtures)로 진행합니다.");
    const sample = readJson(PATHS.fixture, []);
    for (const s of sample) services[s.서비스ID] = { ...s, _sample: true };
    writeJson(PATHS.raw, services);
    return { added: sample.length, total: Object.keys(services).length, sample: true };
  }

  // 증분 수집 기준: 지금까지 본 레코드 중 가장 늦은 수정일시 (API가 주는 형식 그대로 재사용)
  const since = full ? null : state.maxUpdatedAt || null;

  let page = 1;
  let changed = 0;
  for (;;) {
    const json = await fetchPage(page, since);
    const rows = json.data || [];
    for (const row of rows) {
      const prev = services[row.서비스ID];
      if (!prev || prev.수정일시 !== row.수정일시) changed++;
      services[row.서비스ID] = row;
    }
    console.log(`[fetch] page ${page}: ${rows.length}건 (누적 변경 ${changed})`);
    if (rows.length < PER_PAGE || page * PER_PAGE >= (json.matchCount ?? json.totalCount ?? 0)) break;
    page++;
  }

  // 샘플이 섞여 있으면 실데이터 수집 시 제거
  for (const [id, s] of Object.entries(services)) if (s._sample) delete services[id];

  const maxUpdatedAt = Object.values(services)
    .map((s) => String(s.수정일시 || ""))
    .reduce((a, b) => (b > a ? b : a), state.maxUpdatedAt || "");

  writeJson(PATHS.raw, services);
  writeJson(PATHS.state, { ...state, maxUpdatedAt, lastRunAt: new Date().toISOString() });
  return { added: changed, total: Object.keys(services).length, sample: false };
}

if (isMain(import.meta.url)) {
  const r = await fetchServices({ full: process.argv.includes("--full") });
  console.log(`[fetch] 완료: 변경 ${r.added}건 / 전체 ${r.total}건${r.sample ? " (샘플)" : ""}`);
}

// Batch API로 대량 요약 (가격 50%, 보통 1시간 안에 완료, 최대 24시간)
//   node src/batch.js submit [건수]  아직 Claude 요약이 없는 건을 배치로 제출 (조회수 많은 순)
//   node src/batch.js status        제출한 배치 진행 상황
//   node src/batch.js collect       끝난 배치 결과를 data/enriched.json 에 반영
// 배치에서는 fallbacks(거절 시 대체 모델)를 쓸 수 없어서, 거절·오류 건은 규칙 기반 요약을 유지한다.
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PATHS, ROOT, isMain, readJson, writeJson } from "./config.js";
import { finalize, requestParams } from "./enrich.js";

const BATCHES = path.join(ROOT, "data", "batches.json"); // [{id, createdAt, map: {custom_id: 서비스ID}, collected}]
const MAX_PER_BATCH = 100000;

export async function submit(limit = 0) {
  const services = readJson(PATHS.raw, {});
  const enriched = readJson(PATHS.enriched, {});
  const batches = readJson(BATCHES, []);

  // 이미 진행 중인(미수집) 배치에 들어간 건은 제외
  const pending = new Set(batches.filter((b) => !b.collected).flatMap((b) => Object.values(b.map)));
  let todo = Object.values(services)
    .filter((s) => enriched[s.서비스ID]?.method !== "claude" || enriched[s.서비스ID]?.sourceUpdatedAt !== s.수정일시)
    .filter((s) => !pending.has(s.서비스ID))
    .sort((a, b) => Number(b.조회수 || 0) - Number(a.조회수 || 0));
  if (limit > 0) todo = todo.slice(0, limit);
  todo = todo.slice(0, MAX_PER_BATCH);
  if (!todo.length) return console.log("[batch] 제출할 건이 없습니다.");

  const map = {};
  const requests = todo.map((s, i) => {
    const custom_id = `r${i}`; // custom_id는 영숫자·_- 64자 이내여야 해서 순번을 쓰고 매핑을 따로 저장
    map[custom_id] = s.서비스ID;
    return { custom_id, params: requestParams(s) };
  });

  const client = new Anthropic();
  const batch = await client.messages.batches.create({ requests });
  batches.push({ id: batch.id, createdAt: new Date().toISOString(), count: requests.length, map, collected: false });
  writeJson(BATCHES, batches);
  console.log(`[batch] 제출 완료: ${batch.id} (${requests.length}건) · 상태 ${batch.processing_status}`);
}

export async function status() {
  const client = new Anthropic();
  for (const b of readJson(BATCHES, [])) {
    if (b.collected) { console.log(`${b.id}: 수집 완료 (${b.count}건)`); continue; }
    const r = await client.messages.batches.retrieve(b.id);
    const c = r.request_counts;
    console.log(`${b.id}: ${r.processing_status} · 처리중 ${c.processing} / 성공 ${c.succeeded} / 오류 ${c.errored} / 만료 ${c.expired} / 취소 ${c.canceled}`);
  }
}

export async function collect() {
  const client = new Anthropic();
  const batches = readJson(BATCHES, []);
  const services = readJson(PATHS.raw, {});
  const enriched = readJson(PATHS.enriched, {});
  let applied = 0, skipped = 0, waiting = 0;

  for (const b of batches.filter((x) => !x.collected)) {
    const r = await client.messages.batches.retrieve(b.id);
    if (r.processing_status !== "ended") { waiting++; console.log(`[batch] ${b.id} 아직 진행 중 (처리중 ${r.request_counts.processing}건)`); continue; }

    for await (const res of await client.messages.batches.results(b.id)) {
      const id = b.map[res.custom_id]; // 결과 순서는 제출 순서와 다를 수 있어 custom_id로 매칭
      const s = services[id];
      if (!s) continue;
      if (res.result.type !== "succeeded") { skipped++; continue; }
      const msg = res.result.message;
      if (msg.stop_reason !== "end_turn") { skipped++; continue; } // refusal·max_tokens
      try {
        const out = JSON.parse(msg.content.filter((c) => c.type === "text").map((c) => c.text).join(""));
        enriched[id] = finalize(s, out, "claude");
        applied++;
      } catch {
        skipped++;
      }
    }
    b.collected = true;
    b.collectedAt = new Date().toISOString();
  }

  writeJson(PATHS.enriched, enriched);
  writeJson(BATCHES, batches);
  console.log(`[batch] 반영 ${applied}건, 건너뜀 ${skipped}건${waiting ? `, 진행 중 배치 ${waiting}개` : ""}`);
  return { applied, skipped, waiting };
}

if (isMain(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "submit") await submit(Number(arg || 0));
  else if (cmd === "status") await status();
  else if (cmd === "collect") await collect();
  else console.log("사용법: node src/batch.js submit [건수] | status | collect");
}

// 2단계: 가공 — Claude가 원문을 "누가·얼마·언제까지·어떻게"로 요약하고 분류한다.
// 수정일시가 바뀐 건만 다시 처리하므로 매일 돌려도 비용은 변경분만큼만 든다.
// ANTHROPIC_API_KEY가 없으면 규칙 기반 요약으로 대체해 파이프라인은 끝까지 돈다.
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, CONFIG, PATHS, ROOT, isMain, readJson, writeJson } from "./config.js";

const SYSTEM = `당신은 한국 정부·지자체 지원사업을 일반인이 이해하기 쉽게 정리하는 에디터입니다.
입력으로 공공서비스 원문 데이터(JSON)가 주어집니다. 아래 원칙을 지키세요.
- 원문에 없는 금액·조건·날짜를 지어내지 마세요. 모르면 빈 문자열로 두세요.
- 말투는 친절한 존댓말, 중학생도 이해할 수 있게 쉽게.
- summary: 40자 안팎 한 줄. "누가 + 무엇을 받는지" 형태.
- easy_explain: 2~3문장 쉬운 설명.
- target_short: 신청 대상 핵심 조건을 한 줄로.
- amount_text: 지원 금액/규모를 짧게 (예: "월 최대 20만원 × 12개월"). 금액이 없으면 지원 형태를 적기.
- deadline: 신청기한이 특정 날짜면 YYYY-MM-DD, 상시·연중·기한 없음이면 빈 문자열.
- always_open: 상시/연중 신청이면 true.
- category: 가장 알맞은 분야 하나.
- tags: 검색에 쓸 짧은 키워드 3~6개.
- steps: 신청 절차를 2~5단계로.
- seo_title: 검색 결과용 제목, 30자 이내, 서비스명과 핵심 혜택 포함. "2026" 같은 연도는 원문에 있을 때만.
- seo_description: 80자 이내 검색 설명문.
- faq: 사람들이 실제로 검색할 만한 질문 3개와 원문 근거 답변.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "easy_explain", "target_short", "amount_text", "deadline", "always_open",
    "category", "tags", "steps", "seo_title", "seo_description", "faq",
  ],
  properties: {
    summary: { type: "string" },
    easy_explain: { type: "string" },
    target_short: { type: "string" },
    amount_text: { type: "string" },
    deadline: { type: "string" },
    always_open: { type: "boolean" },
    category: { type: "string", enum: Object.keys(CATEGORIES) },
    tags: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
    seo_title: { type: "string" },
    seo_description: { type: "string" },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } },
      },
    },
  },
};

// 원문 중 요약에 필요한 필드만 보낸다 (토큰 절약)
const PICK = ["서비스명", "서비스목적요약", "지원대상", "선정기준", "지원내용", "신청방법", "신청기한",
  "소관기관명", "서비스분야", "사용자구분", "지원유형", "접수기관"];

function slimRecord(s) {
  return Object.fromEntries(PICK.filter((k) => s[k]).map((k) => [k, String(s[k]).slice(0, 2000)]));
}

// ---------- 규칙 기반 대체 요약 (API 키 없을 때 / 실패 시) ----------
const CATEGORY_RULES = [
  ["youth", /청년/], ["family", /출산|임신|육아|아동|보육|영유아/], ["senior", /노인|어르신|기초연금/],
  ["disabled", /장애/], ["smallbiz", /소상공인|중소기업|기업|자영업/], ["job", /일자리|고용|취업|창업/],
  ["housing", /주거|월세|전세|주택/], ["health", /건강|의료|질병|검진/], ["education", /교육|학생|장학/],
  ["farm", /농업|농림|어업|농가/], ["lowincome", /저소득|기초생활|생계|차상위|에너지/],
];

export function parseDeadline(text = "") {
  const m = String(text).match(/(20\d{2})[.\-년\s]+(\d{1,2})[.\-월\s]+(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function firstLine(text = "", max = 80) {
  const line = String(text).split(/\n|○|-\s/).map((t) => t.trim()).find(Boolean) || "";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

export function ruleBasedEnrich(s) {
  const blob = `${s.서비스명} ${s.서비스분야} ${s.지원대상} ${s.사용자구분}`;
  const category = (CATEGORY_RULES.find(([, re]) => re.test(blob)) || ["etc"])[0];
  const always = /상시|연중|수시/.test(s.신청기한 || "");
  const name = String(s.서비스명 || "").replace(/^\[샘플\]\s*/, "");
  return {
    summary: firstLine(s.서비스목적요약 || name, 50),
    easy_explain: firstLine(s.서비스목적요약, 200),
    target_short: firstLine(s.지원대상, 70),
    amount_text: firstLine(s.지원내용, 60),
    deadline: always ? "" : parseDeadline(s.신청기한),
    always_open: always,
    category,
    tags: [CATEGORIES[category], s.지원유형, s.사용자구분].filter(Boolean),
    steps: [firstLine(s.신청방법, 80)].filter(Boolean),
    seo_title: `${name} 신청방법·대상 총정리`.slice(0, 40),
    seo_description: `${firstLine(s.지원대상, 40)} | ${firstLine(s.지원내용, 40)}`,
    faq: [
      { q: `${name} 신청 대상은?`, a: firstLine(s.지원대상, 200) },
      { q: `${name} 얼마나 받을 수 있나요?`, a: firstLine(s.지원내용, 200) },
      { q: `${name} 신청은 어디서 하나요?`, a: firstLine(s.신청방법, 200) },
    ].filter((f) => f.a),
  };
}

// ---------- Claude 요약 ----------
function hasClaudeCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// 일반 호출·배치 호출이 공유하는 요청 본문
export function requestParams(s) {
  return {
    model: CONFIG.model,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(slimRecord(s), null, 1) }],
  };
}

// Claude 결과 또는 규칙 기반 결과를 enriched.json 항목 형태로 정리
export function finalize(s, result, method, error) {
  if (!CATEGORIES[result.category]) result.category = "etc";
  if (result.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(result.deadline)) result.deadline = parseDeadline(s.신청기한);
  return { ...result, method, error, sourceUpdatedAt: s.수정일시, enrichedAt: new Date().toISOString() };
}

async function claudeEnrich(client, s) {
  const response = await client.beta.messages.create({
    ...requestParams(s),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 안전 분류기가 거절하면 서버가 대체 모델로 자동 재시도
  });

  if (response.stop_reason === "refusal") throw new Error(`refusal (${response.stop_details?.category ?? "unknown"})`);
  if (response.stop_reason === "max_tokens") throw new Error("max_tokens 초과");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = JSON.parse(text);
  return { out, usage: response.usage };
}

async function pool(items, size, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

export async function enrichAll() {
  const services = readJson(PATHS.raw, {});
  const enriched = readJson(PATHS.enriched, {});

  // 사라진 서비스 정리
  for (const id of Object.keys(enriched)) if (!services[id]) delete enriched[id];

  let todo = Object.values(services).filter(
    (s) => enriched[s.서비스ID]?.sourceUpdatedAt !== s.수정일시 || enriched[s.서비스ID]?.method === "rule",
  );
  // 규칙 기반 결과는 키가 생기면 Claude로 다시 처리. 키가 없으면 새/변경 건만 규칙 기반으로.
  const useClaude = hasClaudeCredentials();
  if (!useClaude) todo = todo.filter((s) => enriched[s.서비스ID]?.sourceUpdatedAt !== s.수정일시);
  // 새·변경 건 먼저, 그다음 조회수 많은(=검색 수요 큰) 순으로 Claude 처리
  todo.sort((a, b) =>
    (enriched[a.서비스ID] ? 1 : 0) - (enriched[b.서비스ID] ? 1 : 0) || Number(b.조회수 || 0) - Number(a.조회수 || 0));
  // 진행 중인 배치에 들어간 건은 이미 규칙 기반 요약이 있으면 건너뜀 (중복 비용 방지)
  const pending = new Set(readJson(path.join(ROOT, "data", "batches.json"), [])
    .filter((b) => !b.collected).flatMap((b) => Object.values(b.map)));
  todo = todo.filter((s) => !(pending.has(s.서비스ID) && enriched[s.서비스ID]));
  // 건수 제한은 비용이 드는 Claude 처리에만 적용 (규칙 기반은 무료라 전부 처리)
  if (useClaude && CONFIG.enrichLimit > 0) todo = todo.slice(0, CONFIG.enrichLimit);

  console.log(`[enrich] 처리 대상 ${todo.length}건 / 전체 ${Object.keys(services).length}건 · 방식: ${useClaude ? `Claude (${CONFIG.model})` : "규칙 기반 (ANTHROPIC_API_KEY 없음)"}`);
  if (!todo.length) return { processed: 0, failed: 0 };

  const client = useClaude ? new Anthropic({ maxRetries: 4 }) : null;
  let done = 0, failed = 0, inTok = 0, outTok = 0;

  await pool(todo, CONFIG.concurrency, async (s) => {
    let result, method = "rule", error;
    if (client) {
      try {
        const { out, usage } = await claudeEnrich(client, s);
        result = out;
        method = "claude";
        inTok += usage.input_tokens || 0;
        outTok += usage.output_tokens || 0;
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new Error("ANTHROPIC_API_KEY 인증 실패 — 키를 확인하세요.");
        if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError) {
          // SDK가 이미 재시도함. 이번 실행에서는 건너뛰고 다음 실행에서 다시 시도
          failed++;
          console.warn(`[enrich] 건너뜀 ${s.서비스ID}: ${e.message}`);
          return;
        }
        error = e.message;
        failed++;
        console.warn(`[enrich] Claude 실패 → 규칙 기반 대체 ${s.서비스ID}: ${error}`);
      }
    }
    enriched[s.서비스ID] = finalize(s, result || ruleBasedEnrich(s), method, error);
    done++;
    if (done % 20 === 0) writeJson(PATHS.enriched, enriched); // 중간 저장
  });

  writeJson(PATHS.enriched, enriched);
  if (client) console.log(`[enrich] 토큰 사용: 입력 ${inTok.toLocaleString()} / 출력 ${outTok.toLocaleString()}`);
  return { processed: done, failed };
}

if (isMain(import.meta.url)) {
  const r = await enrichAll();
  console.log(`[enrich] 완료: ${r.processed}건 처리, ${r.failed}건 실패/대체`);
}

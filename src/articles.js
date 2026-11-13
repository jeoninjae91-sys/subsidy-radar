// 개별 지원사업 "신청 가이드" 글 자동 작성 — 매일 몇 편씩 꾸준히 발행 (검색 유입·애드센스 심사용)
// 주제 선정: 아직 글이 없는 사업 중 조회수(=검색 수요)가 높고 신청 가능한 것부터
// 결과: data/articles.json → build.js가 /a/<서비스ID>.html 로 렌더링
//   node src/articles.js [편수]   (기본: ARTICLES_PER_DAY, 없으면 2)
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { CONFIG, ROOT, isMain, readJson, todayKST, writeJson } from "./config.js";
import { loadItems } from "./items.js";

export const ARTICLES_PATH = path.join(ROOT, "data", "articles.json");

const SYSTEM = `당신은 정부 지원제도를 쉽게 풀어 쓰는 생활정보 칼럼니스트입니다.
주어진 지원사업 원문 데이터만 근거로, 이 사업을 검색한 사람이 "내가 받을 수 있는지, 얼마인지, 어떻게 신청하는지"를 한 번에 이해할 수 있는 신청 가이드 글을 씁니다.
- 원문에 없는 금액·조건·날짜·서류를 지어내지 마세요. 원문이 모호하면 "공고문에서 확인 필요"라고 쓰세요.
- 친절한 존댓말, 짧은 문단. 광고성 과장 금지. 제목에 연도는 원문이나 기준일과 맞을 때만.
- sections는 4~6개(예: 어떤 제도인가요 / 누가 받을 수 있나요 / 얼마나 받나요 / 신청 방법과 기간 / 필요 서류·주의할 점 / 함께 보면 좋은 제도). body는 2~4문단, 문단 사이 빈 줄.
- faq는 실제로 검색할 법한 질문 4~5개.
- summary는 독자가 30초 안에 핵심을 파악할 표 형태 요약(대상/금액/기간/신청처)입니다.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "intro", "summary", "sections", "faq"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    intro: { type: "string" },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["target", "amount", "period", "where"],
      properties: { target: { type: "string" }, amount: { type: "string" }, period: { type: "string" }, where: { type: "string" } },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: { heading: { type: "string" }, body: { type: "string" } },
      },
    },
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

const PICK = ["서비스명", "서비스목적요약", "지원대상", "선정기준", "지원내용", "신청방법", "신청기한", "소관기관명",
  "부서명", "서비스분야", "지원유형", "접수기관", "전화문의"];

async function writeArticle(client, item) {
  const src = Object.fromEntries(PICK.filter((k) => item.raw[k]).map((k) => [k, String(item.raw[k]).slice(0, 3000)]));
  const response = await client.beta.messages.create({
    model: CONFIG.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `작성 기준일: ${todayKST()}\n원문 수정일: ${item.updated}\n\n원문(JSON):\n${JSON.stringify(src, null, 1)}` }],
  });
  if (response.stop_reason !== "end_turn") throw new Error(`stop_reason=${response.stop_reason}`);
  return JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

export async function writeArticles(count = Number(process.env.ARTICLES_PER_DAY || 2)) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return console.log("[articles] API 키 없음 → 건너뜀");
  const articles = readJson(ARTICLES_PATH, {});
  const candidates = loadItems()
    .filter((i) => !articles[i.id] && i.method === "claude" && !i.sample && !(i.dday !== null && i.dday < 0))
    .sort((a, b) => b.views - a.views)
    .slice(0, count);
  if (!candidates.length) return console.log("[articles] 새로 쓸 주제가 없습니다.");

  const client = new Anthropic({ maxRetries: 4 });
  for (const item of candidates) {
    try {
      const a = await writeArticle(client, item);
      articles[item.id] = { ...a, published: todayKST(), sourceUpdatedAt: item.raw.수정일시 };
      writeJson(ARTICLES_PATH, articles);
      console.log(`[articles] 발행: ${a.title}`);
    } catch (e) {
      console.warn(`[articles] ${item.name} 실패: ${e.message}`);
    }
  }
}

if (isMain(import.meta.url)) await writeArticles(Number(process.argv[2] || process.env.ARTICLES_PER_DAY || 2));

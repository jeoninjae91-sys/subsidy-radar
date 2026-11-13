// 분야별 "총정리" 가이드 글 생성 — 검색 유입·애드센스 심사(독창적 콘텐츠)용
// 분야마다 조회수 상위 사업을 근거 자료로 주고 Claude가 읽기 좋은 해설 글을 쓴다.
// 결과는 data/guides.json 에 저장 → build.js 가 /g/<분야>.html 로 렌더링
//   node src/guides.js            없는 분야만 생성
//   node src/guides.js --refresh  전부 다시 생성 (월 1회 정도 권장)
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { CATEGORIES, CONFIG, ROOT, isMain, readJson, todayKST, writeJson } from "./config.js";
import { loadItems } from "./items.js";

export const GUIDES_PATH = path.join(ROOT, "data", "guides.json");

const SYSTEM = `당신은 한국 정부 지원제도를 일반인에게 설명하는 생활정보 칼럼니스트입니다.
주어진 지원사업 목록(공공데이터 요약)만 근거로, 해당 분야 사람들이 꼭 알아야 할 지원금 총정리 글을 씁니다.
- 목록에 없는 금액·조건·날짜를 지어내지 마세요.
- 독자가 "나도 받을 수 있나?"를 빨리 판단하도록, 대상별·상황별로 묶어서 설명하세요.
- 말투는 친절한 존댓말. 광고성 과장 금지.
- sections는 4~6개. 각 section의 body는 2~4문단(문단 사이 빈 줄), 관련 사업은 related_ids에 서비스ID로 연결.
- tips는 신청할 때 실수하기 쉬운 점이나 챙길 서류 등 실용 팁 3~5개.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "intro", "sections", "tips"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    intro: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body", "related_ids"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          related_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
};

async function writeGuide(client, slug, items) {
  const year = todayKST().slice(0, 4);
  const top = items
    .filter((i) => !(i.dday !== null && i.dday < 0))
    .sort((a, b) => b.views - a.views)
    .slice(0, 25)
    .map((i) => ({ id: i.id, 이름: i.name, 요약: i.summary, 대상: i.target_short, 금액: i.amount_text, 마감: i.always_open ? "상시" : i.deadline || i.raw.신청기한, 기관: i.org }));

  const response = await client.beta.messages.create({
    model: CONFIG.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `분야: ${CATEGORIES[slug]}\n작성 기준일: ${todayKST()}\n제목 예시 형식: "${year} ${CATEGORIES[slug]} 지원금 총정리 — …"\n\n지원사업 목록(JSON):\n${JSON.stringify(top)}`,
    }],
  });
  if (response.stop_reason !== "end_turn") throw new Error(`stop_reason=${response.stop_reason}`);
  return JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

export async function buildGuides({ refresh = false } = {}) {
  const guides = readJson(GUIDES_PATH, {});
  const items = loadItems();
  const byCat = {};
  for (const i of items) (byCat[i.category] ||= []).push(i);

  const todo = Object.keys(CATEGORIES).filter((s) => s !== "etc" && (byCat[s]?.length || 0) >= 10 && (refresh || !guides[s]));
  if (!todo.length) return console.log("[guides] 새로 쓸 가이드가 없습니다.");
  const client = new Anthropic({ maxRetries: 4 });

  for (const slug of todo) {
    try {
      const g = await writeGuide(client, slug, byCat[slug]);
      guides[slug] = { ...g, updated: todayKST() };
      writeJson(GUIDES_PATH, guides);
      console.log(`[guides] ${CATEGORIES[slug]}: ${g.title}`);
    } catch (e) {
      console.warn(`[guides] ${CATEGORIES[slug]} 실패: ${e.message}`);
    }
  }
}

if (isMain(import.meta.url)) await buildGuides({ refresh: process.argv.includes("--refresh") });

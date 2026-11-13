// 4단계: 주간 뉴스레터 — "이번 주 마감 임박 + 새로 올라온 지원금"
// out/newsletter-YYYY-MM-DD.html (스티비·메일침프 등에 붙여넣기) / .md (카카오 채널·블로그용)
import fs from "node:fs";
import path from "node:path";
import { CONFIG, PATHS, isMain, todayKST } from "./config.js";
import { closingSoon, ddayLabel, esc, loadItems, recent } from "./items.js";

export function buildNewsletter() {
  const items = loadItems();
  const date = todayKST();
  const soon = closingSoon(items, 14).slice(0, 10);
  const fresh = recent(items, 7).filter((i) => !soon.includes(i)).slice(0, 10);
  const link = (i) => `${CONFIG.siteUrl}/s/${i.slug}.html`;
  const sample = items.some((i) => i.sample);

  const md = [
    `# ${CONFIG.siteName} 주간 브리핑 (${date})`,
    sample ? "> ⚠️ 샘플 데이터로 만든 미리보기입니다." : "",
    "",
    `## ⏰ 마감 임박 TOP ${soon.length}`,
    ...soon.map((i, n) => `${n + 1}. **${i.name}** (${ddayLabel(i)}) — ${i.summary}${i.amount_text ? ` · ${i.amount_text}` : ""}\n   ${link(i)}`),
    "",
    `## 🆕 이번 주 새로 올라온 지원금`,
    ...(fresh.length ? fresh.map((i) => `- **${i.name}** — ${i.summary}\n  ${link(i)}`) : ["- 이번 주 신규 사업 없음"]),
    "",
    "※ AI 요약이므로 신청 전 원문을 꼭 확인하세요.",
  ].join("\n");

  const row = (i) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee">
<a href="${esc(link(i))}" style="font-weight:700;color:#1a1d23;text-decoration:none">${esc(i.name)}</a>
<span style="display:inline-block;margin-left:6px;font-size:12px;font-weight:700;color:#fff;background:${i.dday !== null && i.dday <= 7 ? "#d1242f" : "#5d6472"};border-radius:999px;padding:1px 8px">${esc(ddayLabel(i))}</span>
<div style="color:#5d6472;font-size:14px;margin-top:4px">${esc(i.summary)}${i.amount_text ? ` · <b>${esc(i.amount_text)}</b>` : ""}</div></td></tr>`;

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(CONFIG.siteName)} 주간 브리핑 ${date}</title></head>
<body style="margin:0;background:#f7f8fa;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;padding:24px 20px"><tr><td>
${sample ? '<p style="background:#fff4d6;padding:8px;font-size:13px">⚠️ 샘플 데이터로 만든 미리보기입니다.</p>' : ""}
<h1 style="font-size:22px;margin:0 0 4px">${esc(CONFIG.siteName)} 주간 브리핑</h1>
<p style="color:#5d6472;margin:0 0 20px">${date} · 놓치면 아까운 지원금만 골랐어요</p>
<h2 style="font-size:17px">⏰ 마감 임박 TOP ${soon.length}</h2>
<table role="presentation" width="100%">${soon.map(row).join("")}</table>
<h2 style="font-size:17px;margin-top:28px">🆕 이번 주 새로 올라온 지원금</h2>
<table role="presentation" width="100%">${fresh.length ? fresh.map(row).join("") : '<tr><td style="color:#5d6472">이번 주 신규 사업이 없습니다.</td></tr>'}</table>
<p style="color:#9aa3b2;font-size:12px;margin-top:28px">AI가 공공데이터를 요약한 내용입니다. 신청 전 반드시 원문을 확인하세요.<br>출처: 행정안전부 대한민국 공공서비스(혜택) 정보</p>
</td></tr></table></body></html>`;

  fs.mkdirSync(PATHS.newsletter, { recursive: true });
  const base = path.join(PATHS.newsletter, `newsletter-${date}`);
  fs.writeFileSync(`${base}.md`, md, "utf8");
  fs.writeFileSync(`${base}.html`, html, "utf8");
  return { file: base, soon: soon.length, fresh: fresh.length };
}

if (isMain(import.meta.url)) {
  const r = buildNewsletter();
  console.log(`[newsletter] 마감임박 ${r.soon}건, 신규 ${r.fresh}건 → ${r.file}.html / .md`);
}

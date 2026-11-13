// 3단계: 발행 — 검색 유입용 정적 사이트 생성 (site/ 폴더를 그대로 Netlify·Cloudflare Pages·GitHub Pages에 올리면 됨)
import fs from "node:fs";
import path from "node:path";
import { CATEGORIES, CONFIG, PATHS, isMain, todayKST } from "./config.js";
import { closingSoon, ddayLabel, esc, loadItems, recent } from "./items.js";

const CSS = `
:root{--bg:#f7f8fa;--card:#fff;--text:#1a1d23;--muted:#5d6472;--line:#e3e6eb;--accent:#1f6feb;--hot:#d1242f;--ok:#1a7f37;--chip:#eef2f8}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--text:#e8eaef;--muted:#9aa3b2;--line:#2a2f3a;--accent:#5b9dff;--hot:#ff6b6b;--ok:#4ac26b;--chip:#222836}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;word-break:keep-all}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:860px;margin:0 auto;padding:0 16px}
header.top{background:var(--card);border-bottom:1px solid var(--line)}header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:56px}
.logo{font-weight:800;font-size:18px;color:var(--text)}.logo span{color:var(--accent)}
.notice{background:#fff4d6;color:#6b4e00;padding:10px 16px;text-align:center;font-size:14px}
@media (prefers-color-scheme:dark){.notice{background:#3a2f0b;color:#f5d67a}}
h1{font-size:26px;line-height:1.35;margin:28px 0 8px}h2{font-size:20px;margin:32px 0 12px}
.lead{color:var(--muted);margin:0 0 8px}
.list{display:grid;gap:10px;padding:0;margin:0;list-style:none}
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start}
.item .body{flex:1;min-width:0}.item .title{font-weight:700;color:var(--text)}.item .sum{color:var(--muted);font-size:14px;margin-top:2px}
.badge{flex:none;font-size:13px;font-weight:700;border-radius:999px;padding:3px 10px;background:var(--chip);color:var(--muted);white-space:nowrap}
.badge.hot{background:var(--hot);color:#fff}.badge.ok{background:var(--ok);color:#fff}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:0;list-style:none}
.cats a{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--text);font-weight:600}
.cats small{color:var(--muted);font-weight:400}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:16px 0}
.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.fact b{display:block;font-size:13px;color:var(--muted);font-weight:600}
ol.steps{padding-left:20px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chip{background:var(--chip);border-radius:999px;padding:2px 10px;font-size:13px;color:var(--muted)}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:8px}summary{font-weight:700;cursor:pointer}
table.src{width:100%;border-collapse:collapse;font-size:14px;background:var(--card)}table.src th,table.src td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;white-space:pre-line}table.src th{width:110px;color:var(--muted);font-weight:600}
.cta{display:inline-block;background:var(--accent);color:#fff;border-radius:10px;padding:12px 18px;font-weight:700;margin:12px 0}.cta:hover{text-decoration:none;opacity:.9}
footer{color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:48px;padding:24px 0 40px}
.crumb{font-size:14px;color:var(--muted);margin-top:16px}
`;

function layout({ title, description, canonical, body, jsonLd, sample, base = "../" }) {
  const ads = CONFIG.adsenseClient
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(CONFIG.adsenseClient)}" crossorigin="anonymous"></script>`
    : "";
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(CONFIG.siteName)}">
${sample ? '<meta name="robots" content="noindex">' : ""}
${CONFIG.googleVerification ? `<meta name="google-site-verification" content="${esc(CONFIG.googleVerification)}">` : ""}
${CONFIG.naverVerification ? `<meta name="naver-site-verification" content="${esc(CONFIG.naverVerification)}">` : ""}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
${ads}
<style>${CSS}</style>
</head><body>
${sample ? '<div class="notice">⚠️ 샘플 데이터로 만든 미리보기입니다. 실제 지원사업 정보가 아닙니다.</div>' : ""}
<header class="top"><div class="wrap"><a class="logo" href="${base}index.html">지원금 <span>레이더</span></a><a href="${base}index.html#closing">마감 임박</a></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">
정보 출처: 행정안전부 「대한민국 공공서비스(혜택) 정보」(공공데이터포털) · 요약은 AI가 작성했으며 실제 내용과 다를 수 있습니다. 신청 전 반드시 원문(정부24)을 확인하세요.<br>
마지막 업데이트 ${todayKST()} · © ${esc(CONFIG.siteName)}
</div></footer>
</body></html>`;
}

function itemRow(i, base = "") {
  const cls = i.dday !== null && i.dday >= 0 && i.dday <= 7 ? "hot" : i.always_open ? "ok" : "";
  return `<li class="item"><div class="body"><a class="title" href="${base}s/${i.slug}.html">${esc(i.name)}</a>
<div class="sum">${esc(i.summary)}${i.amount_text ? ` · <b>${esc(i.amount_text)}</b>` : ""}</div></div>
<span class="badge ${cls}">${esc(ddayLabel(i))}</span></li>`;
}

function servicePage(i) {
  const url = `${CONFIG.siteUrl}/s/${i.slug}.html`;
  const r = i.raw;
  const srcRows = [
    ["지원대상", r.지원대상], ["선정기준", r.선정기준], ["지원내용", r.지원내용], ["신청방법", r.신청방법],
    ["신청기한", r.신청기한], ["접수기관", r.접수기관], ["문의", r.전화문의], ["소관기관", [r.소관기관명, r.부서명].filter(Boolean).join(" ")],
  ].filter(([, v]) => v);

  const body = `
<div class="crumb"><a href="../index.html">홈</a> › <a href="../c/${i.category}.html">${esc(i.categoryName)}</a></div>
<h1>${esc(i.name)}</h1>
<p class="lead">${esc(i.summary)}</p>
<div class="chips">${(i.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`).join("")}</div>
<div class="facts">
  <div class="fact"><b>누가</b>${esc(i.target_short || "-")}</div>
  <div class="fact"><b>얼마</b>${esc(i.amount_text || "-")}</div>
  <div class="fact"><b>언제까지</b>${i.always_open ? "상시 신청" : esc(i.deadline || r.신청기한 || "-")} <span class="badge ${i.dday !== null && i.dday <= 7 && i.dday >= 0 ? "hot" : ""}">${esc(ddayLabel(i))}</span></div>
</div>
<h2>쉽게 말하면</h2><p>${esc(i.easy_explain)}</p>
${i.steps?.length ? `<h2>신청 방법</h2><ol class="steps">${i.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
${r.상세조회URL ? `<a class="cta" href="${esc(r.상세조회URL)}" target="_blank" rel="noopener nofollow">정부24 원문 확인하기 →</a>` : ""}
${i.faq?.length ? `<h2>자주 묻는 질문</h2>${i.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}` : ""}
<h2>원문 정보</h2>
<table class="src">${srcRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
<p class="lead" style="font-size:13px;margin-top:8px">원문 수정일 ${esc(i.updated || "-")} · 확인일 ${todayKST()}</p>`;

  const jsonLd = i.faq?.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: i.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
    : null;
  return layout({ title: i.seo_title || i.name, description: i.seo_description || i.summary, canonical: url, body, jsonLd, sample: i.sample });
}

function categoryPage(slug, list, sample) {
  const name = CATEGORIES[slug];
  const sorted = [...list].sort((a, b) => (a.dday ?? 9999) - (b.dday ?? 9999));
  const open = sorted.filter((i) => !(i.dday !== null && i.dday < 0));
  const body = `<div class="crumb"><a href="../index.html">홈</a></div>
<h1>${esc(name)} 지원금 모음</h1><p class="lead">신청 가능한 ${esc(name)} 분야 지원사업 ${open.length}건 · 마감 가까운 순</p>
<ul class="list">${open.map((i) => itemRow(i, "../")).join("")}</ul>`;
  return layout({ title: `${name} 지원금 총정리 | ${CONFIG.siteName}`, description: `${name} 분야 정부·지자체 지원금 ${open.length}건을 마감일 순으로 정리했습니다.`, canonical: `${CONFIG.siteUrl}/c/${slug}.html`, body, sample });
}

function indexPage(items, byCat, sample) {
  const soon = closingSoon(items, 14).slice(0, 20);
  const fresh = recent(items, 14).slice(0, 20);
  const popular = [...items].filter((i) => !(i.dday !== null && i.dday < 0)).sort((a, b) => b.views - a.views).slice(0, 10);
  const body = `
<h1>놓치면 아까운 지원금,<br>마감 전에 알려드려요</h1>
<p class="lead">정부·지자체 지원사업 ${items.length.toLocaleString()}건을 매일 업데이트하고 쉬운 말로 정리합니다.</p>
<h2 id="closing">⏰ 마감 임박 (2주 이내)</h2>
${soon.length ? `<ul class="list">${soon.map((i) => itemRow(i)).join("")}</ul>` : '<p class="lead">2주 안에 마감되는 사업이 없습니다.</p>'}
<h2>🆕 새로 올라온 지원금</h2>
${fresh.length ? `<ul class="list">${fresh.map((i) => itemRow(i)).join("")}</ul>` : '<p class="lead">최근 2주간 새 사업이 없습니다.</p>'}
<h2>🔥 많이 찾는 지원금</h2><ul class="list">${popular.map((i) => itemRow(i)).join("")}</ul>
<h2>분야별로 보기</h2>
<ul class="cats">${Object.entries(CATEGORIES).filter(([s]) => byCat[s]?.length).map(([s, n]) => `<li><a href="c/${s}.html">${esc(n)}<br><small>${byCat[s].length}건</small></a></li>`).join("")}</ul>`;
  return layout({ title: `${CONFIG.siteName} - 마감 임박 정부지원금·혜택 한눈에`, description: "청년·출산·소상공인·노인 등 정부와 지자체 지원금을 매일 모아 쉬운 말로 정리하고 마감일을 알려드립니다.", canonical: `${CONFIG.siteUrl}/`, body, sample, base: "" });
}

function write(rel, content) {
  const file = path.join(PATHS.site, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

export function buildSite() {
  const items = loadItems();
  const sample = items.some((i) => i.sample);
  fs.rmSync(PATHS.site, { recursive: true, force: true });

  const byCat = {};
  for (const i of items) (byCat[i.category] ||= []).push(i);

  // static/ 폴더(검색엔진 소유권 확인 파일 등)를 그대로 복사
  const staticDir = path.join(path.dirname(PATHS.site), "static");
  if (fs.existsSync(staticDir)) fs.cpSync(staticDir, PATHS.site, { recursive: true });

  write("index.html", indexPage(items, byCat, sample));
  for (const [slug, list] of Object.entries(byCat)) write(`c/${slug}.html`, categoryPage(slug, list, sample));
  for (const i of items) write(`s/${i.slug}.html`, servicePage(i));

  const urls = [
    `${CONFIG.siteUrl}/`,
    ...Object.keys(byCat).map((s) => `${CONFIG.siteUrl}/c/${s}.html`),
    ...items.map((i) => `${CONFIG.siteUrl}/s/${i.slug}.html`),
  ];
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${todayKST()}</lastmod></url>`).join("\n")}\n</urlset>\n`);
  write("robots.txt", sample ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${CONFIG.siteUrl}/sitemap.xml\n`);
  return { pages: urls.length, items: items.length, sample };
}

if (isMain(import.meta.url)) {
  const r = buildSite();
  console.log(`[build] 완료: 페이지 ${r.pages}개 (지원사업 ${r.items}건) → site/${r.sample ? " (샘플·noindex)" : ""}`);
}

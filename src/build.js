// 3단계: 발행 — 검색 유입용 정적 사이트 생성 (site/ 폴더를 그대로 Netlify·Cloudflare Pages·GitHub Pages에 올리면 됨)
import fs from "node:fs";
import path from "node:path";
import { CATEGORIES, CONFIG, PATHS, isMain, readJson, todayKST } from "./config.js";

let GUIDES = {}; // 분야별 가이드 (buildSite에서 로드)
let ARTICLES = {}; // 사업별 신청 가이드 글 (buildSite에서 로드)
import { closingSoon, ddayLabel, esc, loadItems, recent } from "./items.js";
import { buildCare } from "./care-build.js";
import { guideLinks } from "./care-guides.js";
import { buildPrice } from "./price-build.js";
import { buildParents } from "./parents-build.js";

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
img.hero{display:block;width:100%;height:auto;border-radius:14px;margin:14px 0 4px;background:var(--chip)}
table.src.t th{width:auto}a.chip:hover{text-decoration:none;color:var(--accent)}
`;

// 돌봄(장기요양기관) 섹션은 CARE_PUBLISH=1 일 때만 정식 발행·메뉴 노출
const CARE_ON = process.env.CARE_PUBLISH === "1";
// 예방접종 가격(비급여 진료비) 섹션은 PRICE_PUBLISH=1 일 때만 정식 발행·링크 노출
const PRICE_ON = process.env.PRICE_PUBLISH === "1";

// 지원사업 상세(/s/) 약 1만 쪽은 공공데이터를 AI가 요약한 대량 생성 페이지다. 2026-11-24 애드센스가
// "가치가 별로 없는 콘텐츠"로 반려해, 기본값은 검색엔진 색인에서 빼고(noindex,follow) 사이트맵에도 넣지 않는다.
// 페이지 자체는 그대로 만들어 방문자가 볼 수 있다. 다시 색인시키려면 INDEX_BULK=1.
const INDEX_BULK = process.env.INDEX_BULK === "1";

export function layout({ title, description, canonical, body, jsonLd, sample, base = "../", source, image, noindex }) {
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
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ""}
${sample ? '<meta name="robots" content="noindex">' : noindex ? '<meta name="robots" content="noindex,follow">' : ""}
${CONFIG.googleVerification ? `<meta name="google-site-verification" content="${esc(CONFIG.googleVerification)}">` : ""}
${CONFIG.naverVerification ? `<meta name="naver-site-verification" content="${esc(CONFIG.naverVerification)}">` : ""}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
${ads}
<style>${CSS}</style>
</head><body>
${sample ? '<div class="notice">⚠️ 샘플 데이터로 만든 미리보기입니다. 실제 지원사업 정보가 아닙니다.</div>' : ""}
<header class="top"><div class="wrap"><a class="logo" href="${base}index.html">지원금 <span>레이더</span></a><span><a href="${base}parents/">부모님 혜택</a> · ${CARE_ON ? `<a href="${base}care/index.html">요양기관 찾기</a> · ` : ""}${Object.keys(ARTICLES).length ? `<a href="${base}a/index.html">신청 가이드</a> · ` : ""}<a href="${base}index.html#closing">마감 임박</a></span></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">
${source || "정보 출처: 행정안전부 「대한민국 공공서비스(혜택) 정보」(공공데이터포털) · 요약은 AI가 작성했으며 실제 내용과 다를 수 있습니다. 신청 전 반드시 원문(정부24)을 확인하세요."}<br>
${PRICE_ON ? `<a href="${base}price/index.html">병원 비급여 가격</a> · ` : ""}<a href="${base}about.html">소개</a> ·<a href="${base}privacy.html">개인정보처리방침</a> · <a href="${base}contact.html">문의</a><br>
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
${ARTICLES[i.id] ? `<p><a href="../a/${encodeURIComponent(i.id)}.html">📝 ${esc(ARTICLES[i.id].title)} — 자세한 신청 가이드 읽기</a></p>` : ""}
${i.steps?.length ? `<h2>신청 방법</h2><ol class="steps">${i.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
${r.상세조회URL ? `<a class="cta" href="${esc(r.상세조회URL)}" target="_blank" rel="noopener nofollow">정부24 원문 확인하기 →</a>` : ""}
${i.faq?.length ? `<h2>자주 묻는 질문</h2>${i.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}` : ""}
<h2>원문 정보</h2>
<table class="src">${srcRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
<p class="lead" style="font-size:13px;margin-top:8px">원문 수정일 ${esc(i.updated || "-")} · 확인일 ${todayKST()}</p>`;

  const jsonLd = i.faq?.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: i.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
    : null;
  return layout({ title: i.seo_title || i.name, description: i.seo_description || i.summary, canonical: url, body, jsonLd, sample: i.sample, noindex: !INDEX_BULK });
}

function categoryPage(slug, list, sample) {
  const name = CATEGORIES[slug];
  const sorted = [...list].sort((a, b) => (a.dday ?? 9999) - (b.dday ?? 9999));
  const open = sorted.filter((i) => !(i.dday !== null && i.dday < 0));
  const body = `<div class="crumb"><a href="../index.html">홈</a></div>
<h1>${esc(name)} 지원금 모음</h1><p class="lead">신청 가능한 ${esc(name)} 분야 지원사업 ${open.length}건 · 마감 가까운 순</p>
${GUIDES[slug] ? `<p><a href="../g/${slug}.html">📘 ${esc(GUIDES[slug].title)}</a></p>` : ""}
<ul class="list">${open.map((i) => itemRow(i, "../")).join("")}</ul>`;
  return layout({ title: `${name} 지원금 총정리 | ${CONFIG.siteName}`, description: `${name} 분야 정부·지자체 지원금 ${open.length}건을 마감일 순으로 정리했습니다.`, canonical: `${CONFIG.siteUrl}/c/${slug}.html`, body, sample });
}

// 첫 화면: 직접 만든 도구와 안내 글을 먼저 보여 주고, 공공데이터 목록은 그 아래에 짧게 둔다.
function indexPage(items, byCat, sample) {
  const soon = closingSoon(items, 14).slice(0, 8);
  const popular = [...items].filter((i) => !(i.dday !== null && i.dday < 0)).sort((a, b) => b.views - a.views).slice(0, 5);
  const card = (href, title, text) => `<li><a href="${href}"><b>${esc(title)}</b><br><small>${esc(text)}</small></a></li>`;
  const row = (href, title, sum) => `<li class="item"><div class="body"><a class="title" href="${href}">${esc(title)}</a>${sum ? `<div class="sum">${esc(sum)}</div>` : ""}</div></li>`;
  const careGuides = CARE_ON && !sample ? guideLinks() : [];
  const articles = Object.entries(ARTICLES).sort((a, b) => b[1].published.localeCompare(a[1].published)).slice(0, 6);
  const body = `
<style>.tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;padding:0;margin:0;list-style:none}
.tools a{display:block;height:100%;background:var(--card);border:2px solid var(--accent);border-radius:14px;padding:16px;color:var(--text)}
.tools a:hover{text-decoration:none;opacity:.9}.tools b{font-size:18px}.tools small{color:var(--muted);font-size:14px}</style>
<h1>부모님과 우리 가족이 받을 수 있는 지원,<br>쉽게 찾아 드려요</h1>
<p class="lead">나이와 사는 곳만 넣으면 받을 수 있는 혜택을 찾아 주고, 요양 비용을 미리 계산해 볼 수 있습니다. 신청 방법은 직접 정리한 안내 글로 설명합니다.</p>
${sample ? "" : `<h2>먼저 해 보세요</h2>
<ul class="tools">
${card("parents/", "부모님 혜택 찾기", "부모님 출생연도와 사는 곳을 넣으면 지금 받을 수 있는 혜택과 앞으로 받게 될 혜택을 보여 드립니다.")}
${CARE_ON ? card("care/cost.html", "요양원·주간보호 비용 계산기", "장기요양등급과 시설 종류를 고르면 한 달에 실제로 내는 돈을 계산합니다.") : ""}
${CARE_ON ? card("care/index.html", "우리 동네 요양기관 찾기", "시·군·구별 요양원, 주야간보호센터, 방문요양 기관을 정원·비급여 비용과 함께 봅니다.") : ""}
</ul>`}
${careGuides.length ? `<h2>📘 부모님 돌봄·혜택 안내</h2>
<p class="lead">신청 순서와 금액, 놓치기 쉬운 점을 한 편씩 정리했습니다.</p>
<ul class="list">${careGuides.map((g) => row(`care/g/${g.slug}.html`, g.title, g.description)).join("")}</ul>` : ""}
${articles.length ? `<h2>📝 지원금 신청 가이드</h2><ul class="list">${articles.map(([id, a]) => row(`a/${encodeURIComponent(id)}.html`, a.title, a.description)).join("")}</ul><p><a href="a/index.html">신청 가이드 전체 보기 →</a></p>` : ""}
${Object.keys(GUIDES).length ? `<h2>📚 분야별 지원금 총정리</h2><ul class="list">${Object.entries(GUIDES).map(([s, g]) => row(`g/${s}.html`, g.title, g.description)).join("")}</ul>` : ""}
<h2 id="closing">⏰ 마감이 가까운 지원금</h2>
${soon.length ? `<ul class="list">${soon.map((i) => itemRow(i)).join("")}</ul>` : '<p class="lead">2주 안에 마감되는 사업이 없습니다.</p>'}
<h2>🔥 많이 찾는 지원금</h2><ul class="list">${popular.map((i) => itemRow(i)).join("")}</ul>
<h2>분야별로 찾아보기</h2>
<p class="lead">행정안전부 공공서비스 목록의 지원사업을 분야별로 모았습니다. 매일 새로 가져옵니다.</p>
<ul class="cats">${Object.entries(CATEGORIES).filter(([s]) => byCat[s]?.length).map(([s, n]) => `<li><a href="c/${s}.html">${esc(n)}<br><small>${byCat[s].length}건</small></a></li>`).join("")}</ul>`;
  return layout({ title: `${CONFIG.siteName} - 부모님 혜택 찾기·요양 비용 계산·지원금 신청 안내`, description: "부모님 나이와 사는 곳으로 받을 수 있는 혜택을 찾고, 요양원·주간보호 비용을 계산해 보세요. 장수축하금·기초연금·장기요양 신청 방법을 쉽게 정리했습니다.", canonical: `${CONFIG.siteUrl}/`, body, sample, base: "" });
}

// 분야별 가이드 글 (/g/<분야>.html)
const paras = (t) => String(t || "").split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join("");

function guidePage(slug, g, itemById) {
  const sections = g.sections.map((s) => {
    const rel = (s.related_ids || []).map((id) => itemById[id]).filter(Boolean);
    return `<h2>${esc(s.heading)}</h2>${paras(s.body)}${rel.length ? `<ul class="list">${rel.map((i) => itemRow(i, "../")).join("")}</ul>` : ""}`;
  }).join("");
  const body = `<div class="crumb"><a href="../index.html">홈</a> › <a href="../c/${slug}.html">${esc(CATEGORIES[slug])}</a></div>
<h1>${esc(g.title)}</h1>
<p class="lead">업데이트 ${esc(g.updated)} · 공공데이터 기반 정리</p>
${paras(g.intro)}
${sections}
${g.tips?.length ? `<h2>신청 전에 꼭 확인하세요</h2><ul>${g.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
<p><a class="cta" href="../c/${slug}.html">${esc(CATEGORIES[slug])} 지원금 전체 보기 →</a></p>`;
  return layout({ title: `${g.title} | ${CONFIG.siteName}`, description: g.description, canonical: `${CONFIG.siteUrl}/g/${slug}.html`, body });
}

// 사업별 신청 가이드 글 (/a/<id>.html)
function articlePage(id, a, item) {
  const s = a.summary || {};
  const body = `<div class="crumb"><a href="../index.html">홈</a> › <a href="index.html">신청 가이드</a>${item ? ` › <a href="../c/${item.category}.html">${esc(item.categoryName)}</a>` : ""}</div>
<h1>${esc(a.title)}</h1>
<p class="lead">발행 ${esc(a.published)}${item ? ` · 원문 수정일 ${esc(item.updated)}` : ""}</p>
<div class="facts">
  <div class="fact"><b>대상</b>${esc(s.target || "-")}</div>
  <div class="fact"><b>지원 내용</b>${esc(s.amount || "-")}</div>
  <div class="fact"><b>신청 기간</b>${esc(s.period || "-")}${item ? ` <span class="badge ${item.dday !== null && item.dday >= 0 && item.dday <= 7 ? "hot" : ""}">${esc(ddayLabel(item))}</span>` : ""}</div>
  <div class="fact"><b>신청처</b>${esc(s.where || "-")}</div>
</div>
${paras(a.intro)}
${a.sections.map((x) => `<h2>${esc(x.heading)}</h2>${paras(x.body)}`).join("")}
${a.faq?.length ? `<h2>자주 묻는 질문</h2>${a.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}` : ""}
${item ? `<p><a class="cta" href="../s/${item.slug}.html">원문 정보·정부24 링크 보기 →</a></p>` : ""}
<p class="lead" style="font-size:13px">이 글은 행정안전부 공공서비스(혜택) 정보를 바탕으로 정리했습니다. 신청 전 반드시 원문 공고를 확인하세요.</p>`;
  const jsonLd = a.faq?.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: a.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
    : null;
  return layout({ title: a.title, description: a.description, canonical: `${CONFIG.siteUrl}/a/${encodeURIComponent(id)}.html`, body, jsonLd });
}

function articleListPage(list) {
  const body = `<div class="crumb"><a href="../index.html">홈</a></div>
<h1>지원금 신청 가이드</h1><p class="lead">많이 찾는 지원사업을 하나씩 골라 대상·금액·신청 방법을 자세히 정리했어요. 매일 새 글이 올라옵니다.</p>
<ul class="list">${list.map(([id, a]) => `<li class="item"><div class="body"><a class="title" href="${encodeURIComponent(id)}.html">${esc(a.title)}</a><div class="sum">${esc(a.description)}</div></div><span class="badge">${esc(a.published.slice(5))}</span></li>`).join("")}</ul>`;
  return layout({ title: `지원금 신청 가이드 | ${CONFIG.siteName}`, description: "많이 찾는 정부 지원금의 대상·금액·신청 방법을 자세히 정리한 가이드 모음입니다.", canonical: `${CONFIG.siteUrl}/a/index.html`, body });
}

// 사이트 소개·개인정보처리방침·문의 (애드센스 심사 필수 페이지)
function infoPages(count) {
  const page = (slug, title, description, body) =>
    [slug, layout({ title: `${title} | ${CONFIG.siteName}`, description, canonical: `${CONFIG.siteUrl}/${slug}.html`, base: "",
      body: `<div class="crumb"><a href="index.html">홈</a></div><h1>${esc(title)}</h1>${body}` })];
  const issues = CONFIG.contactUrl;
  return [
    page("about", "지원금 레이더 소개", "지원금 레이더는 정부·지자체 지원사업을 매일 모아 쉬운 말로 정리하는 정보 사이트입니다.", `
<p>지원금 레이더는 "받을 수 있는데 몰라서 못 받는 지원금"을 줄이기 위해 만든 정보 사이트입니다.</p>
<h2>직접 만든 것</h2>
<ul>
<li><a href="parents/">부모님 혜택 찾기</a> — 부모님 출생연도와 사는 곳을 넣으면 지금 받을 수 있는 노인 혜택과 몇 년 안에 받게 될 혜택을 골라 보여 줍니다.</li>
<li><a href="care/cost.html">요양원·주간보호 비용 계산기</a> — 보건복지부 장기요양 급여비용 고시의 등급별 금액으로 한 달 본인부담금을 계산합니다.</li>
<li><a href="care/index.html">요양기관 찾기</a> — 국민건강보험공단 공개 자료로 시·군·구별 기관의 정원과 비급여 비용을 정리했습니다.</li>
<li>안내 글 — 장기요양등급 신청, 본인부담금 감경, 장수축하금·효도수당처럼 가족이 실제로 부딪히는 주제를 한 편씩 직접 써서 정리합니다. 금액은 출처와 확인한 날짜를 함께 적습니다.</li>
</ul>
<h2>지원사업 목록은 이렇게 만듭니다</h2>
<ul>
<li>행정안전부가 공개하는 「대한민국 공공서비스(혜택) 정보」에서 정부·지자체·공공기관 지원사업 약 ${count.toLocaleString()}건을 <b>매일</b> 가져옵니다.</li>
<li>사업마다 <b>누가 · 얼마 · 언제까지 · 어떻게</b> 신청하는지 쉬운 말로 정리하고, 마감이 가까운 순서로 보여 드립니다.</li>
<li>청년, 출산·육아, 소상공인, 노인, 장애인 등 분야별로 찾아볼 수 있습니다.</li>
</ul>
<h2>정보는 어떻게 만들어지나요</h2>
<p>원문 데이터를 AI(Claude)가 요약하고, 모든 페이지에 원문 정보와 정부24 원문 링크, 원문 수정일을 함께 표시합니다. 요약은 이해를 돕기 위한 것이며 실제 내용과 다를 수 있으니, <b>신청 전 반드시 원문을 확인</b>해 주세요.</p>
<h2>운영 원칙</h2>
<ul><li>지원사업 신청을 대행하거나 수수료를 받지 않습니다.</li><li>정부·공공기관과 무관한 민간 정보 사이트입니다.</li><li>잘못된 정보를 발견하시면 <a href="contact.html">문의</a>로 알려 주세요.</li></ul>`),
    page("privacy", "개인정보처리방침", "지원금 레이더의 개인정보처리방침입니다.", `
<p>지원금 레이더(이하 "사이트")는 이용자의 개인정보를 중요하게 생각하며, 관련 법령을 준수합니다.</p>
<h2>1. 수집하는 개인정보</h2>
<p>사이트는 회원가입이 없습니다. 이용자가 <a href="parents/">부모님 혜택 알림</a>을 신청할 때에만 아래 정보를 받습니다.</p>
<table class="src"><tr><th>항목</th><td>이메일 주소, 부모님 출생연도, 부모님 거주 지역(시·도, 시·군·구), 신청 경로</td></tr>
<tr><th>목적</th><td>부모님 연세·지역에 맞는 새 혜택, 신청 마감, 나이 기준 도래 알림 발송</td></tr>
<tr><th>보관 기간</th><td>알림 해지 시까지. 해지하면 즉시 삭제합니다. 알림 메일마다 해지 링크가 들어갑니다.</td></tr>
<tr><th>처리 위탁</th><td>Cloudflare, Inc. (신청 정보 저장 서버 운영)</td></tr></table>
<p>이름·전화번호·주민등록번호는 받지 않으며, 신청 정보를 제3자에게 제공하거나 판매하지 않습니다. 동의하지 않으면 알림을 받을 수 없을 뿐, 혜택 찾기는 그대로 이용할 수 있습니다.</p>
<h2>2. 쿠키 및 광고</h2>
<p>사이트는 Google AdSense 등 제3자 광고 서비스를 사용할 수 있습니다. Google을 포함한 제3자 공급업체는 쿠키를 사용하여 이용자의 이 사이트 및 다른 사이트 방문 기록을 바탕으로 광고를 게재합니다. Google은 광고 쿠키를 사용하여 이용자에게 맞춤 광고를 제공할 수 있습니다.</p>
<p>이용자는 <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google 광고 설정</a>에서 맞춤 광고를 사용 중지할 수 있으며, <a href="https://www.aboutads.info" target="_blank" rel="noopener">www.aboutads.info</a>에서 제3자 공급업체의 맞춤 광고 쿠키를 사용 중지할 수 있습니다. 브라우저 설정으로 쿠키 저장을 거부할 수도 있습니다.</p>
<h2>3. 접속 기록</h2>
<p>사이트를 호스팅하는 서비스(GitHub Pages) 및 검색·광고 서비스 제공자가 서비스 제공과 보안을 위해 접속 기록(IP 주소, 브라우저 정보 등)을 처리할 수 있습니다.</p>
<h2>4. 문의</h2>
<p>개인정보 관련 문의는 <a href="contact.html">문의 페이지</a>를 이용해 주세요.</p>
<p class="lead" style="font-size:13px">시행일: ${todayKST().slice(0, 7)}-01</p>`),
    page("contact", "문의", "지원금 레이더 문의 안내", `
<p>정보 오류 제보, 제휴, 그 밖의 문의는 아래로 보내 주세요.</p>
<p><a class="cta" href="${esc(issues)}" target="_blank" rel="noopener">문의 남기기 →</a></p>
<p class="lead">지원사업 자격·신청 결과 등 개별 사업에 대한 문의는 각 사업 페이지의 소관기관 연락처나 정부24로 해 주세요.</p>`),
  ];
}

function write(rel, content) {
  const file = path.join(PATHS.site, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

export function buildSite() {
  const items = loadItems();
  const sample = items.some((i) => i.sample);
  GUIDES = readJson(path.join(path.dirname(PATHS.site), "data", "guides.json"), {});
  ARTICLES = readJson(path.join(path.dirname(PATHS.site), "data", "articles.json"), {});
  fs.rmSync(PATHS.site, { recursive: true, force: true });

  const byCat = {};
  for (const i of items) (byCat[i.category] ||= []).push(i);

  // static/ 폴더(검색엔진 소유권 확인 파일 등)를 그대로 복사
  const staticDir = path.join(path.dirname(PATHS.site), "static");
  if (fs.existsSync(staticDir)) fs.cpSync(staticDir, PATHS.site, { recursive: true });

  write("index.html", indexPage(items, byCat, sample));
  for (const [slug, list] of Object.entries(byCat)) write(`c/${slug}.html`, categoryPage(slug, list, sample));
  for (const i of items) write(`s/${i.slug}.html`, servicePage(i));
  const info = infoPages(items.length);
  for (const [slug, html] of info) write(`${slug}.html`, html);
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const guides = GUIDES;
  for (const [slug, g] of Object.entries(guides)) write(`g/${slug}.html`, guidePage(slug, g, itemById));
  const articleList = Object.entries(ARTICLES).sort((a, b) => b[1].published.localeCompare(a[1].published));
  for (const [id, a] of articleList) write(`a/${encodeURIComponent(id)}.html`, articlePage(id, a, itemById[id]));
  if (articleList.length) write("a/index.html", articleListPage(articleList));

  // 애드센스 ads.txt (ADSENSE_CLIENT=ca-pub-XXXX 설정 시) / 개인 도메인 CNAME (CUSTOM_DOMAIN 설정 시)
  if (CONFIG.adsenseClient) write("ads.txt", `google.com, ${CONFIG.adsenseClient.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
  if (CONFIG.customDomain) write("CNAME", `${CONFIG.customDomain}\n`);

  // 부모님 혜택 찾기 + 알림 신청 (/parents/)
  const parents = sample ? { urls: [] } : buildParents(write, items, { sample });

  const urls = [
    `${CONFIG.siteUrl}/`,
    ...parents.urls,
    ...info.map(([slug]) => `${CONFIG.siteUrl}/${slug}.html`),
    ...Object.keys(guides).map((slug) => `${CONFIG.siteUrl}/g/${slug}.html`),
    ...(articleList.length ? [`${CONFIG.siteUrl}/a/index.html`] : []),
    ...articleList.map(([id]) => `${CONFIG.siteUrl}/a/${encodeURIComponent(id)}.html`),
    ...Object.keys(byCat).map((s) => `${CONFIG.siteUrl}/c/${s}.html`),
    ...(INDEX_BULK ? items.map((i) => `${CONFIG.siteUrl}/s/${i.slug}.html`) : []),
  ];
  const sitemap = (list) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${todayKST()}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  write("sitemap.xml", sitemap(urls));

  // 돌봄 섹션: 실데이터가 있고 CARE_PUBLISH=1 일 때만 발행. 사이트맵은 URL 5만 개 한도 때문에 따로 둔다.
  const care = CARE_ON && !sample ? buildCare() : { urls: [] };
  const careMaps = [];
  for (let i = 0; i < care.urls.length; i += 40000) {
    const name = `sitemap-care${careMaps.length ? `-${careMaps.length + 1}` : ""}.xml`;
    write(name, sitemap(care.urls.slice(i, i + 40000)));
    careMaps.push(name);
  }

  // 예방접종 가격 섹션: 실데이터가 있고 PRICE_PUBLISH=1 일 때만 발행. 검색 노출을 따로 보려고 사이트맵을 나눈다.
  const price = PRICE_ON && !sample ? buildPrice() : { urls: [] };
  if (price.urls.length) {
    write("sitemap-price.xml", sitemap(price.urls));
    careMaps.push("sitemap-price.xml");
  }

  write("robots.txt", sample ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${CONFIG.siteUrl}/sitemap.xml\n${careMaps.map((m) => `Sitemap: ${CONFIG.siteUrl}/${m}\n`).join("")}`);
  return { pages: urls.length + care.urls.length + price.urls.length, items: items.length, sample, carePages: care.urls.length, pricePages: price.urls.length };
}

if (isMain(import.meta.url)) {
  const r = buildSite();
  console.log(`[build] 완료: 페이지 ${r.pages}개 (지원사업 ${r.items}건) → site/${r.sample ? " (샘플·noindex)" : ""}`);
}

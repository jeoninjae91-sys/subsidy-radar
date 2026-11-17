// 가격 2단계: 발행 — /price/ 아래에 항목·시도·시군구 가격 비교 페이지 생성
//   price/index.html                 항목 목록
//   price/<항목>/index.html          전국 (시도 목록, 종류별 통계)
//   price/<항목>/<시도코드>.html      시도 (시군구 목록 + 기관이 적은 시군구의 가격표)
//   price/<항목>/<시군구코드>.html    시군구 (의료기관별 가격표) — 기관 MIN_SGGU_ROWS곳 이상일 때만
// 단독 실행(`node src/price-build.js`)은 미리보기용: site/price 만 다시 만든다.
import fs from "node:fs";
import path from "node:path";
import { CONFIG, PATHS, isMain } from "./config.js";
import { esc } from "./items.js";
import { layout } from "./build.js";
import { scrollTables } from "./care-guides.js";
import { ITEMS, MIN_SGGU_ROWS, kindLabel, loadPrice, stats } from "./price-common.js";

const SOURCE = `정보 출처: 건강보험심사평가원 「비급여진료비정보조회서비스」(공공데이터포털, 공공누리 제1유형). 병원급 이상 의료기관만 포함하며 동네 의원은 포함되지 않습니다. 금액은 의료기관이 심평원에 신고한 비급여 진료비로, 조회 시점 기준이며 실제 청구액과 다를 수 있습니다. 접종 전 반드시 의료기관에 금액과 백신 재고를 확인하세요. 이 사이트는 의료기관을 추천·알선하지 않으며 의학적 조언을 제공하지 않습니다.`;

const won = (v) => `${Number(v).toLocaleString()}원`;
const range = (r) => (r.max > r.min ? `${won(r.min)} ~ ${won(r.max)}` : won(r.min));
const ymd = (s) => (/^\d{8}$/.test(String(s || "")) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : "");
const byPrice = (a, b) => a.min - b.min || a.name.localeCompare(b.name, "ko");
const group = (rows, key) => rows.reduce((m, r) => ((m[key(r)] ||= []).push(r), m), {});
// 심평원 시군구명은 광역시 구에 도시 이름이 붙어 온다("대구달서구", 전남광주의 "광주북구") → "달서구", "대구 달서구"로 푼다.
// 경기 "광주시"처럼 시도 이름에 그 도시가 없으면 건드리지 않는다.
function splitSggu(r) {
  const m = String(r.sgguNm || "").match(/^(서울|부산|대구|인천|광주|대전|울산)(.{1,}[구군])$/);
  return m && String(r.sidoNm || "").includes(m[1]) ? { city: m[1], name: m[2] } : { city: r.sidoNm || "", name: r.sgguNm || "" };
}
const sgguName = (r) => splitSggu(r).name;
const place = (r) => { const s = splitSggu(r); return [s.city, s.name].filter(Boolean).join(" "); };
// 이 API는 병원급 이상만 공개한다(의원 제외) — 모든 페이지에 밝힌다
const SCOPE = "병원급 이상 의료기관";

// 종류(백신)가 여럿이면 금액대가 달라 섞어서 중간값을 내면 뜻이 없다.
// 범위(최저·최고)는 전체로, 중간 금액과 지역 비교는 전국에서 가장 많이 신고된 종류 하나로 낸다.
function mainOf(rows, ctx) {
  const own = rows.filter((r) => r.code === ctx.mainCode);
  return { s: stats(own.length ? own : rows), label: own.length && ctx.multi ? ctx.mainLabel : "" };
}

function factBox(s, m) {
  return `<div class="facts">
  <div class="fact"><b>가장 낮은 금액</b>${won(s.min)}</div>
  <div class="fact"><b>중간 금액${m.label ? ` (${esc(m.label)})` : ""}</b>${won(m.s.mid)}</div>
  <div class="fact"><b>가장 높은 금액</b>${won(s.max)}</div>
</div>`;
}

// 두 중간 금액 비교 문장
function compare(label, mine, otherLabel, other) {
  if (!mine.s || !other.s || mine.label !== other.label) return "";
  const d = mine.s.mid - other.s.mid;
  const how = d === 0 ? "과 같습니다" : `보다 ${won(Math.abs(d))} ${d < 0 ? "낮습니다" : "높습니다"}`;
  return `${mine.label ? `${mine.label} 기준으로 ` : ""}${label}의 중간 금액은 ${won(mine.s.mid)}으로, ${otherLabel} 중간 금액 ${won(other.s.mid)}${how}.`;
}

// 종류(백신)별 가격표
function tables(rows, it, item, { withPlace = false } = {}) {
  const kinds = group(rows, (r) => r.code);
  const order = Object.keys(kinds).sort((a, b) => kinds[b].length - kinds[a].length);
  return order.map((code) => {
    const list = kinds[code].sort(byPrice);
    const label = kindLabel(it.codes[code]?.name, item);
    const note = it.codes[code]?.note;
    const head = order.length > 1 || label !== "구분 없음" ? `<h2 id="k-${esc(code)}">${esc(label === "구분 없음" ? item.name : label)} · ${list.length}곳</h2>` : `<h2>의료기관별 금액 · ${list.length}곳</h2>`;
    return `${head}
${note ? `<p class="lead" style="font-size:14px">심평원 항목 설명: ${esc(note)}</p>` : ""}
<table class="src t"><tr><th>의료기관</th>${withPlace ? "<th>지역</th>" : ""}<th>종별</th><th>신고 금액</th><th>적용일</th></tr>
${list.map((r) => `<tr><td>${esc(r.name)}</td>${withPlace ? `<td>${esc(sgguName(r))}</td>` : ""}<td>${esc(r.cl || "-")}</td><td>${range(r)}</td><td>${esc(ymd(r.from) || "-")}</td></tr>`).join("")}</table>`;
  }).join("\n");
}

const CHECK = (item) => `<h2>접종 전에 확인하세요</h2>
<ul>
<li>이 표에는 <b>병원급 이상 의료기관만</b> 있습니다. 동네 의원의 금액은 심평원 공개 자료(오픈 API)에 포함되지 않아 싣지 못했습니다. 의원은 금액이 다를 수 있으니 가까운 의원에도 문의해 보세요.</li>
<li>금액은 의료기관이 신고한 값이라 그사이 바뀌었을 수 있습니다. 방문 전 전화로 금액과 백신 재고를 확인하세요.</li>
<li>${esc(item.short)} 백신은 종류에 따라 접종 횟수와 금액이 다릅니다. 어떤 백신을 몇 번 맞는지는 의료진과 상의하세요.</li>
<li>지자체에 따라 어르신·취약계층에게 접종비를 지원하기도 합니다. 주소지 보건소에 문의하거나 <a href="../../c/senior.html">노인 대상 지원금</a>을 함께 확인하세요.</li>
<li>같은 금액은 <a href="https://www.hira.or.kr" target="_blank" rel="noopener nofollow">건강보험심사평가원 누리집</a>의 '비급여 진료비 정보'에서도 조회할 수 있습니다.</li>
</ul>`;

function sgguPage(slug, item, it, rows, ctx) {
  const { sidoRows, allRows, fetchedAt, sample, siblings } = ctx;
  const r0 = rows[0];
  const s = stats(rows);
  const m = mainOf(rows, ctx);
  const title = `${place(r0)} ${item.name} 가격`;
  const faq = [
    { q: `${place(r0)}에서 ${item.name} 가격은 얼마인가요?`, a: `건강보험심사평가원에 신고된 금액 기준으로 ${place(r0)} ${SCOPE} ${s.n}곳의 금액은 ${won(s.min)}부터 ${won(s.max)}까지이며, ${m.label ? `${m.label} 기준 ` : ""}중간 금액은 ${won(m.s.mid)}입니다 (${fetchedAt} 확인). 백신 종류에 따라 금액이 다르므로 접종 전 의료기관에 확인하세요.` },
    { q: `가격은 왜 병원마다 다른가요?`, a: `${item.name}은 건강보험이 적용되지 않는 비급여 항목이라 의료기관이 금액을 스스로 정합니다. 백신 종류와 접종 횟수에 따라서도 차이가 납니다.` },
  ];
  const body = `
<div class="crumb"><a href="../index.html">예방접종 가격</a> › <a href="index.html">${esc(item.name)}</a> › <a href="${r0.sido}.html">${esc(r0.sidoNm)}</a></div>
<h1>${esc(title)} 비교</h1>
<p class="lead">${SCOPE} ${s.n}곳이 심평원에 신고한 금액 · 낮은 금액 순 · ${esc(fetchedAt)} 확인</p>
${factBox(s, m)}
<p>${esc([compare(place(r0), m, r0.sidoNm, mainOf(sidoRows, ctx)), compare(r0.sidoNm, mainOf(sidoRows, ctx), "전국", mainOf(allRows, ctx))].filter(Boolean).join(" "))}</p>
${tables(rows, it, item)}
${CHECK(item)}
<h2>자주 묻는 질문</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
${siblings.length ? `<h2>${esc(r0.sidoNm)}의 다른 지역</h2><div class="chips">${siblings.map(([code, name]) => `<a class="chip" href="${code}.html">${esc(name)}</a>`).join("")}</div>` : ""}`;
  return layout({
    title: `${title} 비교 - ${s.n}곳 ${won(s.min)}부터 | ${CONFIG.siteName}`,
    description: `${place(r0)} 의료기관 ${s.n}곳의 ${item.name} 금액을 비교했습니다. 최저 ${won(s.min)}, 최고 ${won(s.max)}. 건강보험심사평가원 공개 자료 기준.`,
    canonical: `${CONFIG.siteUrl}/price/${slug}/${r0.sggu}.html`, body: scrollTables(body), sample, base: "../../", source: SOURCE,
    jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  });
}

function sidoPage(slug, item, it, rows, ctx) {
  const { allRows, fetchedAt, sample, paged } = ctx;
  const r0 = rows[0];
  const s = stats(rows);
  const m = mainOf(rows, ctx);
  const bySggu = Object.entries(group(rows, (r) => r.sggu)).sort((a, b) => sgguName(a[1][0]).localeCompare(sgguName(b[1][0]), "ko"));
  const small = rows.filter((r) => !paged.has(r.sggu)); // 단독 페이지가 없는 시군구의 기관은 여기 싣는다
  const body = `
<div class="crumb"><a href="../index.html">예방접종 가격</a> › <a href="index.html">${esc(item.name)}</a></div>
<h1>${esc(r0.sidoNm)} ${esc(item.name)} 가격 비교</h1>
<p class="lead">${SCOPE} ${s.n}곳이 심평원에 신고한 금액 · ${esc(fetchedAt)} 확인</p>
${factBox(s, m)}
<p>${esc(compare(r0.sidoNm, m, "전국", mainOf(allRows, ctx)))}</p>
<h2>시군구 고르기</h2>
<ul class="cats">${bySggu.map(([code, l]) => {
    const st = stats(l);
    const inner = `${esc(sgguName(l[0]) || "기타")}<br><small>${st.n}곳 · ${won(st.min)}부터</small>`;
    return `<li>${paged.has(code) ? `<a href="${code}.html">${inner}</a>` : `<a href="#etc">${inner}</a>`}</li>`;
  }).join("")}</ul>
${small.length ? `<div id="etc"></div>${tables(small, it, item, { withPlace: true })}` : ""}
${CHECK(item)}`;
  return layout({
    title: `${r0.sidoNm} ${item.name} 가격 비교 - ${s.n}곳 ${won(s.min)}부터 | ${CONFIG.siteName}`,
    description: `${r0.sidoNm} 시군구별 ${item.name} 금액을 의료기관 ${s.n}곳 기준으로 비교했습니다. 최저 ${won(s.min)}, 최고 ${won(s.max)}. 건강보험심사평가원 공개 자료 기준.`,
    canonical: `${CONFIG.siteUrl}/price/${slug}/${r0.sido}.html`, body: scrollTables(body), sample, base: "../../", source: SOURCE,
  });
}

function itemPage(slug, item, it, rows, ctx) {
  const { fetchedAt, sample } = ctx;
  const s = stats(rows);
  const m = mainOf(rows, ctx);
  const bySido = Object.entries(group(rows, (r) => r.sido)).sort((a, b) => a[0].localeCompare(b[0]));
  const kinds = Object.entries(group(rows, (r) => r.code)).sort((a, b) => b[1].length - a[1].length);
  const body = `
<div class="crumb"><a href="../index.html">예방접종 가격</a></div>
<h1>${esc(item.name)} 가격,<br>우리 동네는 얼마일까</h1>
<p class="lead">전국 ${SCOPE} ${s.n.toLocaleString()}곳이 심평원에 신고한 금액을 지역별로 비교했습니다 · ${esc(fetchedAt)} 확인</p>
${factBox(s, m)}
${kinds.length > 1 ? `<h2>종류별 금액</h2>
<table class="src t"><tr><th>종류</th><th>의료기관 수</th><th>최저</th><th>중간</th><th>최고</th></tr>
${kinds.map(([code, l]) => { const k = stats(l); return `<tr><td>${esc(kindLabel(it.codes[code]?.name, item))}</td><td>${k.n.toLocaleString()}곳</td><td>${won(k.min)}</td><td>${won(k.mid)}</td><td>${won(k.max)}</td></tr>`; }).join("")}</table>` : ""}
<h2>지역 고르기</h2>
<ul class="cats">${bySido.map(([code, l]) => { const st = stats(l); return `<li><a href="${code}.html">${esc(l[0].sidoNm)}<br><small>${st.n.toLocaleString()}곳 · ${won(st.min)}부터</small></a></li>`; }).join("")}</ul>
${CHECK(item)}`;
  return layout({
    title: `${item.name} 가격 비교 - 전국 ${s.n.toLocaleString()}곳 지역별 금액 | ${CONFIG.siteName}`,
    description: `전국 의료기관 ${s.n.toLocaleString()}곳의 ${item.name} 금액을 시도·시군구별로 비교했습니다. 최저 ${won(s.min)}, 최고 ${won(s.max)}. 건강보험심사평가원 공개 자료 기준.`,
    canonical: `${CONFIG.siteUrl}/price/${slug}/index.html`, body: scrollTables(body), sample, base: "../../", source: SOURCE,
  });
}

function homePage(list, sample) {
  const body = `
<h1>예방접종 가격 비교</h1>
<p class="lead">건강보험이 적용되지 않는 예방접종은 의료기관마다 금액이 다릅니다. 의료기관이 건강보험심사평가원에 신고한 금액을 지역별로 정리했습니다.</p>
<ul class="list">${list.map(([slug, item, s]) => `<li class="item"><div class="body"><a class="title" href="${slug}/index.html">${esc(item.name)} 가격 비교</a><div class="sum">전국 ${s.n.toLocaleString()}곳 · ${won(s.min)} ~ ${won(s.max)}</div></div></li>`).join("")}</ul>`;
  return layout({
    title: `예방접종 가격 비교 - 우리 동네 의료기관별 금액 | ${CONFIG.siteName}`,
    description: "의료기관이 건강보험심사평가원에 신고한 예방접종 비급여 금액을 시도·시군구별로 비교합니다.",
    canonical: `${CONFIG.siteUrl}/price/index.html`, body, sample, base: "../", source: SOURCE,
  });
}

// preview=true 이면 샘플 데이터로도 만든다(noindex). 정식 발행에서는 샘플이면 아무것도 만들지 않는다.
export function buildPrice({ preview = false } = {}) {
  const data = loadPrice();
  const sample = data.sample;
  if (sample && !preview) return { urls: [], sample };

  const dir = path.join(PATHS.site, "price");
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); // Windows·OneDrive 잠금 대비
  const write = (rel, html) => {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html, "utf8");
  };

  const urls = [];
  const home = [];
  let hospitals = 0;
  for (const [slug, item] of Object.entries(ITEMS)) {
    const it = data.items?.[slug];
    const valid = (it?.rows || []).filter((r) => r.min > 0 && r.sido && r.name);
    // 입력 실수로 보이는 금액은 싣지 않는다: 같은 종류 전국 중간 금액의 40% 미만이거나 3배 초과 (예: 15만 원대 백신에 8,314원)
    const mids = Object.fromEntries(Object.entries(group(valid, (r) => r.code)).map(([code, l]) => [code, stats(l).mid]));
    const rows = valid.filter((r) => r.min >= mids[r.code] * 0.4 && r.min <= mids[r.code] * 3);
    if (valid.length > rows.length) console.log(`[price-build] ${item.name}: 금액 이상치 ${valid.length - rows.length}건 제외`);
    if (!rows.length) continue;
    const allStats = stats(rows);
    hospitals += allStats.n;
    const fetchedAt = data.fetchedAt || "";
    // 전국에서 가장 많은 기관이 신고한 종류 = 중간 금액·지역 비교의 기준
    const byCode = Object.entries(group(rows, (r) => r.code)).sort((a, b) => b[1].length - a[1].length);
    const kind = { mainCode: byCode[0][0], mainLabel: kindLabel(it.codes[byCode[0][0]]?.name, item), multi: byCode.length > 1, allRows: rows };
    const bySggu = group(rows.filter((r) => r.sggu), (r) => r.sggu);
    const paged = new Set(Object.entries(bySggu).filter(([, l]) => new Set(l.map((r) => r.y)).size >= MIN_SGGU_ROWS).map(([code]) => code));

    write(`${slug}/index.html`, itemPage(slug, item, it, rows, { ...kind, fetchedAt, sample }));
    urls.push(`${CONFIG.siteUrl}/price/${slug}/index.html`);
    for (const [sido, sidoRows] of Object.entries(group(rows, (r) => r.sido))) {
      write(`${slug}/${sido}.html`, sidoPage(slug, item, it, sidoRows, { ...kind, fetchedAt, sample, paged }));
      urls.push(`${CONFIG.siteUrl}/price/${slug}/${sido}.html`);
      const names = Object.entries(group(sidoRows.filter((r) => paged.has(r.sggu)), (r) => r.sggu)).map(([code, l]) => [code, sgguName(l[0])]).sort((a, b) => a[1].localeCompare(b[1], "ko"));
      for (const [sggu] of names) {
        write(`${slug}/${sggu}.html`, sgguPage(slug, item, it, bySggu[sggu], { ...kind, sidoRows, fetchedAt, sample, siblings: names.filter(([c]) => c !== sggu) }));
        urls.push(`${CONFIG.siteUrl}/price/${slug}/${sggu}.html`);
      }
    }
    home.push([slug, item, allStats]);
  }
  if (!home.length) return { urls: [], sample };
  write("index.html", homePage(home, sample));
  urls.unshift(`${CONFIG.siteUrl}/price/index.html`);
  return { urls, hospitals, sample };
}

if (isMain(import.meta.url)) {
  const r = buildPrice({ preview: true });
  console.log(`[price-build] 완료: 페이지 ${r.urls.length}개 (의료기관 ${r.hospitals || 0}곳) → site/price/${r.sample ? " (샘플·noindex 미리보기)" : ""}`);
}

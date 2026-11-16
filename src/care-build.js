// 돌봄 2단계: 발행 — /care/ 아래에 시도·시군구·기관 페이지 생성
//   care/index.html          전국 (시도 목록)
//   care/r/<시도2자리>.html    시도 (시군구 목록)
//   care/r/<시군구5자리>.html  시군구 (유형별 기관 목록)
//   care/f/<기관기호-유형>.html 기관 상세 (상세조회를 받은 입소·통원 시설만)
// 단독 실행(`node src/care-build.js`)은 미리보기용: site/care 만 다시 만든다.
import fs from "node:fs";
import path from "node:path";
import { CONFIG, PATHS, isMain, todayKST } from "./config.js";
import { esc } from "./items.js";
import { layout } from "./build.js";
import { buildCareGuides, guideLinks, scrollTables } from "./care-guides.js";
import { currentRates, nonpaySummary } from "./care-rates.js";
import { SIDO, isFacilityType, isListedType, loadCare, sggCode, sggFullName, sggShortName, typeName } from "./care-common.js";

const SOURCE = `정보 출처: 국민건강보험공단 「장기요양기관 검색·시설별 상세조회 서비스」(공공데이터포털). 정원·현원·비용은 조회 시점 기준이며 실제와 다를 수 있습니다. 입소·이용 전 반드시 기관이나 국민건강보험공단(1577-1000)에 확인하세요. 이 사이트는 기관을 추천·알선하지 않습니다.`;

const uniq = (list) => new Set(list.map((r) => r.sym)).size;
const n = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const ymd = (s) => (/^\d{8}$/.test(String(s || "")) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : String(s || ""));
const won = (v) => (n(v) === null ? esc(v || "-") : `${n(v).toLocaleString()}원`);

// 상세 응답에서 화면에 쓸 값만 뽑기
function facts(r) {
  const d = r.detail || {};
  const p = d.people || {};
  const cap = n(p.totPer);
  const now = n(p.maNowPer) === null && n(p.fmNowPer) === null ? null : (n(p.maNowPer) || 0) + (n(p.fmNowPer) || 0);
  const wait = n(p.maRsvPer) === null && n(p.fmRsvPer) === null ? null : (n(p.maRsvPer) || 0) + (n(p.fmRsvPer) || 0);
  const g = d.general || {};
  const tel = [g.locTelNo_1, g.locTelNo_2, g.locTelNo_3].filter(Boolean).join("-");
  return { cap, now, wait, free: cap !== null && now !== null ? Math.max(cap - now, 0) : null, tel, g, d };
}

function seatBadge(f) {
  if (f.free === null) return "";
  return f.free > 0 ? `<span class="badge ok">빈자리 ${f.free}명</span>` : `<span class="badge">${f.wait ? `대기 ${f.wait}명` : "정원 참"}</span>`;
}

function row(r, hasPage) {
  const f = facts(r);
  const title = hasPage ? `<a class="title" href="../f/${r.id}.html">${esc(r.name)}</a>` : `<span class="title">${esc(r.name)}</span>`;
  const sum = [f.cap !== null ? `정원 ${f.cap}명` : "", f.now !== null ? `현원 ${f.now}명` : "", f.tel, r.designated ? `지정 ${ymd(r.designated)}` : ""].filter(Boolean).join(" · ");
  return `<li class="item"><div class="body">${title}<div class="sum">${esc(sum)}</div></div>${seatBadge(f)}</li>`;
}

// 필드 이름은 API 명세에 한글 설명이 없어 실데이터 값으로 대조한 것만 싣는다
const STAFF = [
  ["equipLong", "시설장"], ["socWel", "사회복지사"], ["nur", "간호사"], ["nurArticle", "간호조무사"], ["physicalMTret", "물리치료사"],
  ["wrkMTret", "작업치료사"], ["recuProt_1", "요양보호사(1급)"], ["recuProt_2", "요양보호사(2급)"], ["nut", "영양사"], ["cook", "조리원"],
];
// 비급여 종류 코드: 산정기준 문구(1식·일·회당)로 대조
const NONPAY = { 1: "식사재료비", 2: "상급침실 이용료", 3: "이·미용비" };

function facilityPage(r, regions, sample) {
  const f = facts(r);
  const sgg = sggCode(r.sido, r.sgg);
  const region = sggFullName(regions, r.sido, r.sgg);
  const addr = (f.g.adminAddr || region).replace(/\s+/g, " ").trim();
  const staff = STAFF.map(([k, label]) => [label, n(f.d.staff?.[k])]).filter(([, v]) => v);
  const carers = (n(f.d.staff?.recuProt_1) || 0) + (n(f.d.staff?.recuProt_2) || 0);
  const nonpay = (f.d.nonpay || []).filter((x) => n(x.nonpayTgtAmt));
  const type = typeName(r.pttn);
  // 한 달 예상 비용: 3등급·일반·30일(시설) 또는 20일·8~10시간(주야간보호) 기준
  const R = currentRates(todayKST());
  const np = nonpaySummary(f.d.nonpay);
  const isDay = !R.facility[r.pttn];
  const per = isDay ? R.dayCare.find((d) => d.key === "8").byGrade[3] : R.facility[r.pttn].byGrade[3];
  const days = isDay ? 20 : 30;
  const selfPay = per * days * (isDay ? 0.15 : 0.2);
  const estimate = /03$/.test(r.pttn) || !isDay ? selfPay + (np.meal || 0) * days : null;
  const q = new URLSearchParams({ t: isDay ? "day" : r.pttn, ...(np.meal ? { meal: np.meal } : {}), ...(np.roomMin && !isDay ? { room: 0 } : {}), ...(np.beauty ? { beauty: np.beauty } : {}), n: r.name });
  const costBox = estimate === null ? "" : `<h2>한 달 예상 비용</h2>
<div class="facts">
  <div class="fact"><b>3등급 · ${isDay ? "월 20일(하루 8~10시간)" : "30일"} 기준</b>약 ${Math.round(estimate).toLocaleString()}원</div>
  <div class="fact"><b>급여 본인부담금 (${isDay ? "15" : "20"}%)</b>${Math.round(selfPay).toLocaleString()}원</div>
  <div class="fact"><b>식사재료비</b>${np.meal ? `${(np.meal * days).toLocaleString()}원 (세 끼·간식 하루 ${np.meal.toLocaleString()}원)` : "신고 금액 없음"}</div>
</div>
<p class="lead" style="font-size:13px">${R.year}년 급여비용과 이 기관이 신고한 비급여 금액으로 계산한 추정치입니다.${np.roomMin && !isDay ? ` 상급침실을 쓰면 하루 ${np.roomMin.toLocaleString()}원${np.roomMax > np.roomMin ? `~${np.roomMax.toLocaleString()}원` : ""}이 더 듭니다.` : ""}</p>
<p><a class="cta" href="../cost.html?${esc(q.toString())}">내 등급으로 다시 계산하기 →</a></p>`;

  const body = `
<div class="crumb"><a href="../index.html">요양기관 찾기</a> › <a href="../r/${r.sido}.html">${esc(regions[String(r.sido).padEnd(10, "0")] || SIDO[r.sido] || r.sido)}</a> › <a href="../r/${sgg}.html">${esc(sggShortName(regions, r.sido, r.sgg))}</a></div>
<h1>${esc(r.name)}</h1>
<p class="lead">${esc(region)} · ${esc(type)}</p>
<div class="facts">
  <div class="fact"><b>정원 / 현재 인원</b>${f.cap ?? "-"}명 / ${f.now ?? "-"}명 ${seatBadge(f)}</div>
  <div class="fact"><b>대기 인원</b>${f.wait ?? "-"}명</div>
  <div class="fact"><b>전화</b>${f.tel ? `<a href="tel:${esc(f.tel)}">${esc(f.tel)}</a>` : "-"}</div>
</div>
<h2>기본 정보</h2>
<table class="src">
<tr><th>주소</th><td>${esc(addr)}${f.g.hmPostNo ? ` (우 ${esc(f.g.hmPostNo)})` : ""}</td></tr>
<tr><th>기관 유형</th><td>${esc(type)}</td></tr>
${r.designated ? `<tr><th>지정일</th><td>${esc(ymd(r.designated))}</td></tr>` : ""}
${f.d.etc?.tfMth ? `<tr><th>교통편</th><td>${esc(f.d.etc.tfMth)}</td></tr>` : ""}
${f.d.etc?.pkngEquip ? `<tr><th>주차</th><td>${esc(f.d.etc.pkngEquip)}</td></tr>` : ""}
${/^https?:\/\//.test(f.d.etc?.hmpgAddr || "") ? `<tr><th>홈페이지</th><td><a href="${esc(f.d.etc.hmpgAddr)}" target="_blank" rel="noopener nofollow">${esc(f.d.etc.hmpgAddr)}</a></td></tr>` : ""}
<tr><th>기관기호</th><td>${esc(r.sym)}</td></tr>
</table>
${staff.length ? `<h2>일하는 사람들</h2>
<table class="src">${staff.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}명</td></tr>`).join("")}</table>
${carers && f.now ? `<p class="lead">요양보호사 1명이 어르신 약 ${(f.now / carers).toFixed(1)}명을 돌보는 셈입니다 (현재 인원 ÷ 요양보호사 수, 교대 근무는 반영하지 않은 단순 계산).</p>` : ""}` : ""}
${costBox}
${nonpay.length ? `<h2>비급여 비용 (본인이 전액 내는 항목)</h2>
<table class="src t"><tr><th>항목</th><th>기준</th><th>금액</th><th>기관 수정일</th></tr>
${nonpay.map((x) => `<tr><td>${esc(NONPAY[x.nonpayKind] || "기타")}</td><td>${esc(x.prodBase || "-")}</td><td>${won(x.nonpayTgtAmt)}</td><td>${esc(ymd(x.uptDt))}</td></tr>`).join("")}</table>
<p class="lead" style="font-size:13px">장기요양급여 본인부담금(시설 20%, 재가 15%)은 등급에 따라 따로 계산됩니다.</p>` : ""}
<h2>확인하고 방문하세요</h2>
<ul>
<li>빈자리와 대기 인원은 수시로 바뀝니다. 전화로 먼저 확인하세요.</li>
<li>기관의 평가등급과 행정처분 내역은 <a href="https://www.longtermcare.or.kr" target="_blank" rel="noopener nofollow">노인장기요양보험 누리집</a>의 '장기요양기관 찾기'에서 볼 수 있습니다.</li>
<li>시설 이용에는 장기요양등급이 필요합니다. <a href="../g/grade-apply.html">장기요양등급 신청 방법</a>을 먼저 보세요.</li>
<li>처음 고른다면 <a href="../g/how-to-choose.html">요양원 고르는 법</a>도 함께 보세요.</li>
</ul>
<p><a class="cta" href="../r/${sgg}.html">${esc(sggShortName(regions, r.sido, r.sgg))}의 다른 기관 보기 →</a></p>
<p class="lead" style="font-size:13px">확인일 ${esc(f.d.checkedAt || todayKST())}</p>`;

  return layout({
    title: `${r.name} - ${sggShortName(regions, r.sido, r.sgg)} ${type} 정원·빈자리·비용 | ${CONFIG.siteName}`,
    description: `${region} ${r.name}의 정원 ${f.cap ?? "-"}명, 현재 인원 ${f.now ?? "-"}명, 인력 현황과 비급여 비용을 국민건강보험공단 공개 자료로 정리했습니다.`,
    canonical: `${CONFIG.siteUrl}/care/f/${r.id}.html`, body: scrollTables(body), sample, base: "../../", source: SOURCE,
  });
}

function sggPage(sido, sgg, list, regions, sample) {
  const full = sggFullName(regions, sido, sgg.slice(2));
  const short = sggShortName(regions, sido, sgg.slice(2));
  const byType = {};
  for (const r of list) (byType[r.pttn] ||= []).push(r);
  const order = Object.keys(byType).sort((a, b) => Number(isFacilityType(b)) - Number(isFacilityType(a)) || a.localeCompare(b));
  const sections = order.map((code) => {
    const rows = byType[code].sort((a, b) => (facts(b).free ?? -1) - (facts(a).free ?? -1) || a.name.localeCompare(b.name, "ko"));
    return `<h2 id="${code}">${esc(typeName(code))} ${rows.length}곳</h2><ul class="list">${rows.map((r) => row(r, Boolean(r.detail) && isFacilityType(r.pttn))).join("")}</ul>`;
  }).join("");
  const body = `<div class="crumb"><a href="../index.html">요양기관 찾기</a> › <a href="${sido}.html">${esc(regions[String(sido).padEnd(10, "0")] || SIDO[sido] || sido)}</a></div>
<h1>${esc(short)} 요양원·주간보호센터 찾기</h1>
<p class="lead">${esc(full)}에서 운영 중인 장기요양기관 ${uniq(list)}곳 · 빈자리 많은 순</p>
<div class="chips">${order.map((c) => `<a class="chip" href="#${c}">${esc(typeName(c))} ${byType[c].length}</a>`).join("")}</div>
${sections}`;
  return layout({
    title: `${short} 요양원·주간보호센터 ${uniq(list)}곳 정원·빈자리 | ${CONFIG.siteName}`,
    description: `${full}의 요양원, 주야간보호, 방문요양 등 장기요양기관 ${uniq(list)}곳의 정원·현재 인원·연락처를 국민건강보험공단 공개 자료로 정리했습니다.`,
    canonical: `${CONFIG.siteUrl}/care/r/${sgg}.html`, body, sample, base: "../../", source: SOURCE,
  });
}

function sidoPage(sido, bySgg, regions, sample) {
  const name = regions[String(sido).padEnd(10, "0")] || SIDO[sido] || sido;
  const entries = Object.entries(bySgg).sort((a, b) => sggShortName(regions, sido, a[0].slice(2)).localeCompare(sggShortName(regions, sido, b[0].slice(2)), "ko"));
  const total = uniq(entries.flatMap(([, l]) => l));
  const body = `<div class="crumb"><a href="../index.html">요양기관 찾기</a></div>
<h1>${esc(name)} 요양원·주간보호센터 찾기</h1><p class="lead">${esc(name)} 장기요양기관 ${total.toLocaleString()}곳 · 시군구를 고르세요</p>
<ul class="cats">${entries.map(([sgg, l]) => `<li><a href="${sgg}.html">${esc(sggShortName(regions, sido, sgg.slice(2)))}<br><small>${uniq(l)}곳</small></a></li>`).join("")}</ul>`;
  return layout({
    title: `${name} 요양원·주간보호센터 찾기 | ${CONFIG.siteName}`,
    description: `${name} 시군구별 요양원·주야간보호·방문요양 기관 ${total.toLocaleString()}곳을 정리했습니다.`,
    canonical: `${CONFIG.siteUrl}/care/r/${sido}.html`, body, sample, base: "../../", source: SOURCE,
  });
}

function carePage(tree, regions, total, sample) {
  const sidos = Object.keys(tree).sort((a, b) => Number(a) - Number(b));
  const body = `
<h1>부모님 요양원·주간보호센터,<br>우리 동네에서 찾기</h1>
<p class="lead">전국 장기요양기관 ${total.toLocaleString()}곳의 정원·빈자리·인력·비급여 비용을 국민건강보험공단 공개 자료로 정리했습니다.</p>
<h2>지역 고르기</h2>
<ul class="cats">${sidos.map((s) => `<li><a href="r/${s}.html">${esc(regions[String(s).padEnd(10, "0")] || SIDO[s] || s)}<br><small>${uniq(Object.values(tree[s]).flat()).toLocaleString()}곳</small></a></li>`).join("")}</ul>
<h2>처음이라면 이 순서로</h2>
<ol class="steps">
<li><b>장기요양등급 신청</b> — 국민건강보험공단 지사, 전화(1577-1000) 또는 노인장기요양보험 누리집에서 신청합니다. 공단 직원이 방문해 조사한 뒤 등급이 나옵니다.</li>
<li><b>이용할 급여 정하기</b> — 집에서 받는 재가급여(방문요양·주야간보호 등)와 시설에 들어가는 시설급여(요양원·공동생활가정)가 있습니다.</li>
<li><b>기관 비교</b> — 이 페이지에서 지역을 골라 빈자리, 인력, 비급여 비용을 비교하고 직접 방문해 확인하세요.</li>
</ol>
<p><a class="cta" href="cost.html">요양원 한 달 비용 계산하기 →</a></p>
<h2>알아 두면 좋은 것</h2>
<ul>${guideLinks().map((g) => `<li><a href="g/${g.slug}.html">${esc(g.title)}</a></li>`).join("")}</ul>
<p><a href="../c/senior.html">노인 대상 정부·지자체 지원금도 함께 보기 →</a></p>`;
  return layout({
    title: `우리 동네 요양원·주간보호센터 찾기 - 정원·빈자리·비용 | ${CONFIG.siteName}`,
    description: "전국 요양원·주야간보호·방문요양 기관의 정원, 빈자리, 인력, 비급여 비용을 지역별로 정리했습니다. 국민건강보험공단 공개 자료 기반.",
    canonical: `${CONFIG.siteUrl}/care/index.html`, body, sample, base: "../", source: SOURCE,
  });
}

// preview=true 이면 샘플 데이터로도 만든다(noindex). 정식 발행에서는 샘플이면 아무것도 만들지 않는다.
export function buildCare({ preview = false } = {}) {
  const { institutions, regions, sample } = loadCare();
  if (sample && !preview) return { urls: [], facilities: 0, sample };

  const dir = path.join(PATHS.site, "care");
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); // Windows·OneDrive 잠금 대비
  const write = (rel, html) => {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html, "utf8");
  };

  const live = Object.values(institutions).filter((r) => !r.gone && r.name && isListedType(r.pttn));
  const tree = {}; // 시도 → 시군구(5자리) → 기관들
  for (const r of live) ((tree[r.sido] ||= {})[sggCode(r.sido, r.sgg)] ||= []).push(r);

  const urls = [`${CONFIG.siteUrl}/care/index.html`];
  write("index.html", carePage(tree, regions, uniq(live), sample));
  for (const [sido, bySgg] of Object.entries(tree)) {
    write(`r/${sido}.html`, sidoPage(sido, bySgg, regions, sample));
    urls.push(`${CONFIG.siteUrl}/care/r/${sido}.html`);
    for (const [sgg, list] of Object.entries(bySgg)) {
      write(`r/${sgg}.html`, sggPage(sido, sgg, list, regions, sample));
      urls.push(`${CONFIG.siteUrl}/care/r/${sgg}.html`);
    }
  }
  urls.push(...buildCareGuides(write, { live, sample }).urls);
  let facilities = 0;
  for (const r of live) {
    if (!r.detail || !isFacilityType(r.pttn)) continue;
    write(`f/${r.id}.html`, facilityPage(r, regions, sample));
    urls.push(`${CONFIG.siteUrl}/care/f/${r.id}.html`);
    facilities++;
  }
  return { urls, facilities, institutions: uniq(live), sample };
}

if (isMain(import.meta.url)) {
  const r = buildCare({ preview: true });
  console.log(`[care-build] 완료: 페이지 ${r.urls.length}개 (기관 ${r.institutions}곳, 상세 ${r.facilities}곳) → site/care/${r.sample ? " (샘플·noindex 미리보기)" : ""}`);
}

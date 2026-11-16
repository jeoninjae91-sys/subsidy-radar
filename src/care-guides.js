// 돌봄 가이드: 비용 계산기(care/cost.html)와 안내 글(care/g/<slug>.html)
// 글은 사람이 쓴 고정 원고다. 금액은 care-rates.js 한 곳에서만 가져온다(매년 1월 갱신).
import { CONFIG, todayKST } from "./config.js";
import { esc } from "./items.js";
import { layout } from "./build.js";
import { GRADE_LABEL, currentRates, nonpaySummary } from "./care-rates.js";

const won = (v) => `${Math.round(v).toLocaleString("ko-KR")}원`;
// 열이 많은 표는 좁은 화면에서 옆으로 밀 수 있게 감싼다
export const scrollTables = (html) => html.replace(/<table class="src t">[\s\S]*?<\/table>/g, (t) => `<div style="overflow-x:auto">${t}</div>`);
// 삽화(static/img/care/*.webp, AI로 그린 일러스트)와 공유용 대표 이미지
export const CARE_OG = `${CONFIG.siteUrl}/img/care/og.jpg`;
export const heroImg = (name, alt, base) => `<img class="hero" src="${base}img/care/${name}.webp" width="1200" height="675" alt="${esc(alt)}" decoding="async" fetchpriority="high">`;
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);

const SOURCE = (R) => `금액 기준: 보건복지부 장기요양 급여비용 고시(${R.year}년 적용분)와 국민건강보험공단 공개 자료. 계산 결과는 참고용 추정치이며 실제 청구액과 다를 수 있습니다. 정확한 금액과 감경 대상 여부는 이용할 기관이나 국민건강보험공단(1577-1000)에 확인하세요. 이 사이트는 기관을 추천·알선하지 않습니다.`;

// 수집된 시설 상세에서 전국 비급여 통계를 낸다 (계산기 기본값과 글에 쓴다)
export function careStats(live) {
  const meals = { A03: [], A04: [], day: [] };
  const rooms = [];
  for (const r of live) {
    if (!r.detail?.nonpay?.length) continue;
    const s = nonpaySummary(r.detail.nonpay);
    const group = r.pttn === "A03" || r.pttn === "A04" ? r.pttn : /03$/.test(r.pttn) ? "day" : null;
    if (group && s.meal) meals[group].push(s.meal);
    if (r.pttn === "A03" && s.roomMin) rooms.push(s.roomMin);
  }
  return {
    meal: { A03: median(meals.A03), A04: median(meals.A04), day: median(meals.day) },
    count: { A03: meals.A03.length, A04: meals.A04.length, day: meals.day.length },
    room: median(rooms), roomCount: rooms.length,
  };
}

function costPage(R, stats, sample) {
  const data = {
    facility: Object.fromEntries(Object.entries(R.facility).map(([k, v]) => [k, v.byGrade])),
    dayCare: Object.fromEntries(R.dayCare.map((d) => [d.key, d.byGrade])),
    limit: R.limit,
    share: Object.fromEntries(Object.entries(R.share).map(([k, v]) => [k, v.rate])),
    meal: { A03: stats.meal.A03 || 12000, A04: stats.meal.A04 || 10000, day: stats.meal.day || 5000 },
  };
  const g3 = R.facility.A03.byGrade[3];
  const exMeal = data.meal.A03;
  const exTotal = g3 * 30 * 0.2 + exMeal * 30;
  const opt = (v, label, sel) => `<option value="${v}"${sel ? " selected" : ""}>${esc(label)}</option>`;

  const body = `
<style>
.calc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}
.calc label{display:block;font-size:14px;color:var(--muted);font-weight:600;margin:12px 0 4px}
.calc select,.calc input{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)}
.calc .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:520px){.calc .two{grid-template-columns:1fr}}
.result{background:var(--card);border:2px solid var(--accent);border-radius:14px;padding:18px;margin:16px 0}
.result .big{font-size:30px;font-weight:800;line-height:1.3}
.result table{width:100%;border-collapse:collapse;margin-top:10px;font-size:15px}
.result td{padding:6px 0;border-top:1px solid var(--line)}.result td:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.hint{font-size:13px;color:var(--muted);margin:4px 0 0}
</style>
<div class="crumb"><a href="index.html">요양기관 찾기</a></div>
<h1>요양원·주간보호센터 비용 계산기</h1>
<p class="lead">장기요양등급과 시설 종류를 고르면 한 달에 실제로 내는 돈을 계산합니다. ${R.year}년 급여비용 기준.</p>

<div class="calc" id="calc">
  <div id="fromName" class="hint" style="font-size:15px;color:var(--text);font-weight:700" hidden></div>
  <label for="t">시설 종류</label>
  <select id="t">
    ${opt("A03", "요양원 (노인요양시설) — 입소", true)}
    ${opt("A04", "노인요양공동생활가정 (정원 9명 이하) — 입소")}
    ${opt("day", "주야간보호센터 — 집에서 다님")}
  </select>
  <div class="two">
    <div><label for="g">장기요양등급</label>
    <select id="g">${Object.entries(GRADE_LABEL).map(([k, v]) => opt(k, v, k === "3")).join("")}</select></div>
    <div><label for="s">본인부담 구분</label>
    <select id="s">${Object.entries(R.share).map(([k, v]) => opt(k, v.label, k === "normal")).join("")}</select></div>
  </div>
  <div class="two">
    <div><label for="days">한 달 이용 일수</label><input id="days" type="number" inputmode="numeric" min="1" max="31" value="30"></div>
    <div id="slotBox" hidden><label for="slot">하루 이용 시간</label>
    <select id="slot">${R.dayCare.map((d) => opt(d.key, d.label, d.key === "8")).join("")}</select></div>
  </div>
  <div class="two">
    <div><label for="meal">하루 식사재료비 (원)</label><input id="meal" type="number" inputmode="numeric" min="0" step="500" value="${data.meal.A03}">
    <p class="hint" id="mealHint"></p></div>
    <div id="roomBox"><label for="room">상급침실 하루 추가료 (원)</label><input id="room" type="number" inputmode="numeric" min="0" step="1000" value="0">
    <p class="hint">일반실(보통 4인실)은 0원. 1·2인실을 쓸 때만 냅니다.</p></div>
  </div>
  <label for="beauty">이·미용비 등 그 밖의 월 비용 (원)</label><input id="beauty" type="number" inputmode="numeric" min="0" step="1000" value="0">
</div>

<div class="result" aria-live="polite">
  <div class="lead">한 달 예상 부담</div>
  <div class="big" id="total">-</div>
  <table>
    <tr><td>장기요양 급여 본인부담금 <span id="rateNote"></span></td><td id="self">-</td></tr>
    <tr id="overRow" hidden><td>월 한도액 초과분 (전액 본인 부담)</td><td id="over">-</td></tr>
    <tr><td>식사재료비</td><td id="mealOut">-</td></tr>
    <tr id="roomRow"><td>상급침실 이용료</td><td id="roomOut">-</td></tr>
    <tr><td>그 밖의 비용</td><td id="etcOut">-</td></tr>
    <tr><td>공단이 대신 내는 금액</td><td id="nhis">-</td></tr>
  </table>
  <p class="hint" id="warn"></p>
</div>

${heroImg("cost", "책상 위에 놓인 계산기와 동전, 달력, 요양원 모형", "../").replace(' fetchpriority="high"', ' loading="lazy"')}
<h2>계산 방법</h2>
<ul>
<li><b>급여 본인부담금</b> = 하루 급여비용 × 이용 일수 × 본인부담률. 본인부담률은 입소 시설 20%, 주야간보호 같은 재가급여 15%입니다. 나머지는 국민건강보험공단이 기관에 직접 냅니다.</li>
<li><b>비급여</b>는 전액 본인이 냅니다. 법으로 정해진 비급여는 식사재료비, 상급침실 이용료, 이·미용비 세 가지뿐입니다.</li>
<li><b>주야간보호</b>는 등급별 월 한도액 안에서만 15%가 적용되고, 한도액을 넘는 금액은 전부 본인이 냅니다. 한 달 15일 이상 이용할 때 붙는 한도액 추가 산정과 각종 가산은 이 계산에 넣지 않았습니다.</li>
<li>실제 청구에서는 하루 본인부담금의 10원 미만을 버리므로 몇백 원 차이가 날 수 있습니다.</li>
</ul>

<h2>${R.year}년 하루 급여비용</h2>
<table class="src t"><tr><th>등급</th><th>요양원</th><th>공동생활가정</th><th>주야간보호 (8~10시간)</th><th>재가 월 한도액</th></tr>
${Object.entries(GRADE_LABEL).map(([k, v]) => `<tr><td>${v}</td><td>${R.facility.A03.byGrade[k] ? won(R.facility.A03.byGrade[k]) : "이용 불가"}</td><td>${R.facility.A04.byGrade[k] ? won(R.facility.A04.byGrade[k]) : "이용 불가"}</td><td>${won(R.dayCare.find((d) => d.key === "8").byGrade[k])}</td><td>${won(R.limit[k])}</td></tr>`).join("")}</table>
<p class="lead" style="font-size:13px">요양원 3등급·일반·30일이면 급여 본인부담금 ${won(g3 * 30 * 0.2)}에 식사재료비 약 ${won(exMeal * 30)}을 더해 한 달 약 ${won(exTotal)}입니다. 3~5등급은 등급판정위원회가 시설급여를 인정한 경우에만 입소할 수 있습니다.</p>
${stats.count.A03 ? `<h2>전국 시설이 신고한 비급여 금액</h2>
<ul>
<li>요양원 ${stats.count.A03.toLocaleString()}곳의 하루 식사재료비(간식 포함) 중간값은 <b>${won(stats.meal.A03)}</b>입니다.</li>
${stats.count.A04 ? `<li>노인요양공동생활가정 ${stats.count.A04.toLocaleString()}곳의 중간값은 <b>${won(stats.meal.A04)}</b>입니다.</li>` : ""}
${stats.count.day ? `<li>주야간보호센터 ${stats.count.day.toLocaleString()}곳의 하루 식사재료비 중간값은 <b>${won(stats.meal.day)}</b>입니다.</li>` : ""}
${stats.roomCount ? `<li>상급침실료를 신고한 요양원 ${stats.roomCount.toLocaleString()}곳의 가장 싼 방 기준 중간값은 하루 <b>${won(stats.room)}</b>입니다.</li>` : ""}
</ul>
<p class="lead" style="font-size:13px">이 사이트가 국민건강보험공단 공개 자료에서 모은 시설 기준입니다. 시설마다 금액이 다르니 <a href="index.html">요양기관 찾기</a>에서 가려는 시설의 금액을 확인하세요.</p>` : ""}
<h2>함께 보면 좋은 글</h2>
<ul>${GUIDES.map((g) => `<li><a href="g/${g.slug}.html">${esc(g.title)}</a></li>`).join("")}</ul>

<script>
(function(){
  var D=${JSON.stringify(data)};
  var $=function(id){return document.getElementById(id)};
  var fmt=function(v){return Math.round(v).toLocaleString("ko-KR")+"원"};
  var num=function(id){var v=parseFloat($(id).value);return isFinite(v)&&v>0?v:0};
  var mealTouched=false,daysTouched=false;
  function sync(){
    var day=$("t").value==="day";
    $("slotBox").hidden=!day;$("roomBox").hidden=day;$("roomRow").hidden=day;
    if(!mealTouched)$("meal").value=D.meal[$("t").value];
    if(!daysTouched)$("days").value=day?20:30;
    $("mealHint").textContent=day?"점심·간식 기준. 센터마다 다르니 이용할 곳의 금액으로 바꾸세요.":"세 끼와 간식 합계. 시설이 신고한 금액의 중간값을 넣어 두었습니다.";
  }
  function calc(){
    var t=$("t").value,g=$("g").value,day=t==="day";
    var share=D.share[$("s").value][day?1:0];
    var days=Math.min(num("days"),31);
    var per=day?D.dayCare[$("slot").value][g]:D.facility[t][g];
    var warn="";
    if(!per){
      $("total").textContent="이용할 수 없는 조합입니다";
      ["self","mealOut","roomOut","etcOut","nhis"].forEach(function(i){$(i).textContent="-"});
      $("overRow").hidden=true;$("rateNote").textContent="";
      $("warn").textContent="인지지원등급은 요양원·공동생활가정에 입소할 수 없습니다. 주야간보호를 골라 보세요.";
      return;
    }
    var covered=per*days,over=0;
    if(day){var lim=D.limit[g];if(covered>lim){over=covered-lim;covered=lim;}}
    var self=covered*share,meal=num("meal")*days,room=day?0:num("room")*days,etc=num("beauty");
    $("self").textContent=fmt(self);
    $("rateNote").textContent="("+Math.round(share*100)+"%)";
    $("overRow").hidden=!over;$("over").textContent=fmt(over);
    $("mealOut").textContent=fmt(meal);$("roomOut").textContent=fmt(room);$("etcOut").textContent=fmt(etc);
    $("nhis").textContent=fmt(covered-self);
    $("total").textContent="약 "+fmt(self+over+meal+room+etc);
    if(over)warn="이용 금액이 월 한도액 "+fmt(D.limit[g])+"을 넘어, 넘는 금액은 전부 본인 부담으로 계산했습니다.";
    else if(!day&&(g==="3"||g==="4"||g==="5"))warn="3~5등급은 등급판정위원회가 시설급여를 인정한 경우에만 입소할 수 있습니다.";
    $("warn").textContent=warn;
  }
  // 기관 페이지에서 넘어온 값(?t=A03&meal=12000&room=10000&beauty=5000&n=이름)
  try{
    var q=new URLSearchParams(location.search);
    if(q.get("t")&&(D.facility[q.get("t")]||q.get("t")==="day"))$("t").value=q.get("t");
    ["meal","room","beauty"].forEach(function(k){var v=parseInt(q.get(k),10);if(v>=0){$(k).value=v;if(k==="meal")mealTouched=true;}});
    if(q.get("n")){$("fromName").hidden=false;$("fromName").textContent=q.get("n").slice(0,60)+"의 신고 금액으로 계산합니다";}
  }catch(e){}
  $("meal").addEventListener("input",function(){mealTouched=true});
  $("days").addEventListener("input",function(){daysTouched=true});
  $("t").addEventListener("change",function(){sync();calc()});
  ["g","s","slot","days","meal","room","beauty"].forEach(function(i){$(i).addEventListener("input",calc)});
  sync();calc();
})();
</script>`;

  return layout({
    title: `요양원 비용 계산기 ${R.year} - 등급별 한 달 본인부담금 | ${CONFIG.siteName}`,
    description: `장기요양등급과 시설 종류를 고르면 요양원·공동생활가정·주야간보호센터의 한 달 본인부담금과 식사재료비를 계산합니다. ${R.year}년 급여비용 기준.`,
    canonical: `${CONFIG.siteUrl}/care/cost.html`, body: scrollTables(body), sample, base: "../", source: SOURCE(R), image: CARE_OG,
    jsonLd: { "@context": "https://schema.org", "@type": "WebApplication", name: "요양원 비용 계산기", applicationCategory: "FinanceApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" }, url: `${CONFIG.siteUrl}/care/cost.html` },
  });
}

// 안내 글 원고. body 는 (R, stats) 를 받아 HTML 을 돌려준다.
const GUIDES = [
  {
    slug: "grade-apply",
    alt: "공단 직원이 집을 방문해 어르신과 가족에게 조사 내용을 설명하는 모습",
    title: "장기요양등급 신청 방법: 대상부터 결과 통보까지",
    description: "장기요양등급을 누가, 어디서, 어떻게 신청하는지와 방문조사·의사소견서·등급판정까지의 순서를 정리했습니다.",
    faq: [
      ["장기요양등급은 누가 신청할 수 있나요?", "65세 이상이거나, 65세 미만이라도 치매·뇌혈관질환·파킨슨병 같은 노인성 질병이 있는 사람이 신청할 수 있습니다. 6개월 이상 혼자 일상생활을 하기 어려운 상태여야 등급이 나옵니다."],
      ["신청하면 결과가 나오기까지 얼마나 걸리나요?", "신청서를 낸 날부터 30일 안에 등급판정을 마치는 것이 원칙이며, 정밀조사가 필요하면 30일 범위에서 연장될 수 있습니다."],
      ["가족이 대신 신청할 수 있나요?", "네. 본인이 직접 하기 어려우면 가족이나 친족, 이해관계인, 사회복지전담공무원 등이 대리 신청할 수 있습니다."],
    ],
    body: (R) => `
<p>요양원에 들어가거나 방문요양·주간보호센터를 장기요양보험으로 이용하려면 먼저 <b>장기요양등급</b>을 받아야 합니다. 신청은 무료이고, 국민건강보험공단이 맡습니다.</p>
<h2>누가 신청할 수 있나</h2>
<ul>
<li><b>65세 이상</b>이면 질병 종류와 관계없이 신청할 수 있습니다.</li>
<li><b>65세 미만</b>은 치매, 뇌혈관질환, 파킨슨병 같은 노인성 질병이 있어야 합니다.</li>
<li>두 경우 모두 <b>6개월 이상 혼자 일상생활을 하기 어려운 상태</b>라고 인정되어야 등급이 나옵니다.</li>
</ul>
<h2>어디서 신청하나</h2>
<ul>
<li>가까운 <b>국민건강보험공단 지사</b>(노인장기요양보험 운영센터) 방문</li>
<li>우편·팩스</li>
<li><b>노인장기요양보험 누리집</b>(longtermcare.or.kr) 또는 공단 모바일 앱</li>
<li>문의 전화 1577-1000</li>
</ul>
<p>본인이 하기 어려우면 가족이나 친족이 대신 신청할 수 있습니다.</p>
<h2>신청부터 결과까지</h2>
<ol class="steps">
<li><b>신청서 제출</b> — 장기요양인정 신청서를 냅니다.</li>
<li><b>방문조사</b> — 공단 직원이 집이나 병원으로 찾아와 걷기·옷 입기·식사·기억력 같은 항목을 조사합니다. 평소 모습을 잘 아는 가족이 함께 있는 것이 좋습니다.</li>
<li><b>의사소견서 제출</b> — 공단 안내에 따라 병·의원에서 소견서를 받아 냅니다. 거동이 매우 불편하거나 섬·벽지에 사는 경우에는 내지 않아도 됩니다.</li>
<li><b>등급판정위원회 심의</b> — 조사 결과와 소견서를 바탕으로 등급을 정합니다.</li>
<li><b>결과 통보</b> — 장기요양인정서와 개인별 장기요양이용계획서를 받습니다. 신청일부터 30일 안에 판정하는 것이 원칙입니다.</li>
</ol>
<h2>등급별 기준과 쓸 수 있는 급여</h2>
<table class="src t"><tr><th>등급</th><th>인정점수</th><th>상태</th><th>재가 월 한도액 (${R.year}년)</th></tr>
<tr><td>1등급</td><td>95점 이상</td><td>일상생활 전부에 도움이 필요</td><td>${won(R.limit[1])}</td></tr>
<tr><td>2등급</td><td>75점 이상 95점 미만</td><td>상당 부분 도움이 필요</td><td>${won(R.limit[2])}</td></tr>
<tr><td>3등급</td><td>60점 이상 75점 미만</td><td>부분적으로 도움이 필요</td><td>${won(R.limit[3])}</td></tr>
<tr><td>4등급</td><td>51점 이상 60점 미만</td><td>일정 부분 도움이 필요</td><td>${won(R.limit[4])}</td></tr>
<tr><td>5등급</td><td>45점 이상 51점 미만</td><td>치매 환자</td><td>${won(R.limit[5])}</td></tr>
<tr><td>인지지원등급</td><td>45점 미만</td><td>치매 환자</td><td>${won(R.limit[6])}</td></tr></table>
<ul>
<li><b>1·2등급</b>은 요양원 같은 시설급여와 재가급여 중에서 고를 수 있습니다.</li>
<li><b>3~5등급</b>은 재가급여가 원칙입니다. 돌볼 가족이 없거나 주거 환경이 나쁘거나 치매로 집에서 지내기 어렵다는 사유를 등급판정위원회가 인정하면 시설에 들어갈 수 있습니다.</li>
<li><b>인지지원등급</b>은 주야간보호 등 일부 재가급여만 이용합니다.</li>
</ul>
<h2>결과가 납득되지 않을 때</h2>
<ul>
<li>통보를 받은 날부터 90일 안에 공단에 이의신청(심사청구)을 할 수 있습니다.</li>
<li>판정 뒤에 상태가 나빠졌다면 등급 변경 신청을 할 수 있습니다.</li>
<li>인정서에 적힌 유효기간이 끝나기 90일 전부터 30일 전 사이에 갱신 신청을 해야 급여가 끊기지 않습니다.</li>
</ul>
<h2>등급을 받은 다음</h2>
<p>등급이 나오면 기관을 골라 계약합니다. <a href="../index.html">요양기관 찾기</a>에서 지역별 빈자리와 비용을 비교하고, <a href="../cost.html">비용 계산기</a>로 한 달 부담을 미리 계산해 보세요.</p>`,
  },
  {
    slug: "nursing-home-vs-hospital",
    alt: "왼쪽은 요양보호사가 식사를 돕는 요양원, 오른쪽은 의사와 간호사가 진료하는 요양병원",
    title: "요양원과 요양병원의 차이: 비용·입소 조건 비교",
    description: "요양원과 요양병원은 적용되는 보험, 들어가는 조건, 간병비 부담이 다릅니다. 부모님 상태에 맞는 곳을 고르는 기준을 정리했습니다.",
    faq: [
      ["요양원과 요양병원 중 어디가 더 저렴한가요?", "요양원은 요양보호사의 돌봄이 급여에 포함되어 간병비를 따로 내지 않습니다. 요양병원은 진료비에 건강보험이 적용되지만 간병비는 대부분 전액 본인이 부담해, 간병인을 쓰면 요양원보다 비용이 커지는 경우가 많습니다."],
      ["요양병원도 장기요양등급이 필요한가요?", "아닙니다. 요양병원은 의료기관이라 등급 없이 의사의 판단으로 입원합니다. 요양원은 장기요양등급이 있어야 들어갈 수 있습니다."],
    ],
    body: (R, stats) => `
<p>이름이 비슷하지만 <b>요양원은 생활하는 곳, 요양병원은 치료받는 곳</b>입니다. 적용되는 보험부터 다릅니다.</p>
<table class="src t"><tr><th>구분</th><th>요양원 (노인요양시설)</th><th>요양병원</th></tr>
<tr><td>성격</td><td>돌봄을 받으며 생활하는 시설</td><td>치료를 받는 의료기관</td></tr>
<tr><td>적용 보험</td><td>노인장기요양보험</td><td>국민건강보험</td></tr>
<tr><td>들어가는 조건</td><td>장기요양등급 필요 (1·2등급, 또는 시설급여를 인정받은 3~5등급)</td><td>등급 불필요. 의사의 판단으로 입원</td></tr>
<tr><td>의사</td><td>상주하지 않음. 계약한 의사가 정기적으로 방문</td><td>의사·간호사 상주</td></tr>
<tr><td>돌봄 인력</td><td>요양보호사가 돌봄 (급여에 포함)</td><td>간병인을 따로 써야 하는 경우가 많음</td></tr>
<tr><td>본인 부담</td><td>급여비용의 20% + 식사재료비 등 비급여</td><td>진료비 본인부담 + 간병비(대부분 전액 본인 부담) + 비급여</td></tr></table>
<h2>어떤 경우에 어디가 맞나</h2>
<ul>
<li><b>요양원</b> — 병세는 안정적이지만 식사·배변·이동에 도움이 필요하거나, 치매로 혼자 두기 어려운 경우.</li>
<li><b>요양병원</b> — 수술 뒤 회복, 욕창·투석·인공호흡기처럼 의료 처치가 계속 필요한 경우.</li>
</ul>
<p>요양병원에 있다가 상태가 안정되면 요양원으로 옮기는 경우가 많습니다. 등급 신청은 입원 중에도 할 수 있으니 미리 받아 두면 옮길 때 기다리는 시간이 줄어듭니다.</p>
<h2>요양원 비용은 얼마나 드나</h2>
<p>${R.year}년 기준 요양원 하루 급여비용은 1등급 ${won(R.facility.A03.byGrade[1])}, 2등급 ${won(R.facility.A03.byGrade[2])}, 3~5등급 ${won(R.facility.A03.byGrade[3])}이고 이 가운데 20%를 본인이 냅니다. 3등급이 30일 지내면 급여 본인부담금이 ${won(R.facility.A03.byGrade[3] * 30 * 0.2)}입니다.${stats.meal.A03 ? ` 여기에 식사재료비가 붙는데, 이 사이트가 모은 요양원 ${stats.count.A03.toLocaleString()}곳의 하루 중간값은 ${won(stats.meal.A03)}입니다.` : ""}</p>
<p><a class="cta" href="../cost.html">내 조건으로 한 달 비용 계산하기 →</a></p>
<p>등급이 아직 없다면 <a href="grade-apply.html">장기요양등급 신청 방법</a>부터 보세요.</p>`,
  },
  {
    slug: "how-to-choose",
    alt: "체크리스트를 들고 요양원을 방문한 보호자를 직원이 맞이하는 모습",
    title: "요양원 고르는 법: 방문 전에 확인할 7가지",
    description: "요양원을 고를 때 공개 자료로 미리 확인할 수 있는 정원·빈자리·인력·비급여 비용과, 직접 방문해서 봐야 할 것들을 정리했습니다.",
    body: (R, stats) => `
<p>요양원은 한번 들어가면 옮기기가 쉽지 않습니다. 전화하고 방문하기 전에 공개 자료로 걸러낼 수 있는 것부터 확인하세요.</p>
<h2>공개 자료로 미리 확인할 것</h2>
<ol class="steps">
<li><b>빈자리와 대기 인원</b> — 정원과 현재 인원을 비교합니다. 대기가 길면 여러 곳에 동시에 올려 두는 것이 보통입니다.</li>
<li><b>요양보호사 1명이 돌보는 인원</b> — 현재 인원을 요양보호사 수로 나눕니다. 법정 기준은 입소자 약 2.1~2.3명당 1명이고, 숫자가 작을수록 손이 많이 갑니다. 교대 근무가 있어 실제로 한 시간대에 일하는 사람은 이보다 적습니다.</li>
<li><b>간호 인력과 물리치료사</b> — 욕창·당뇨·투약 관리가 필요하면 간호사·간호조무사 수를, 재활이 필요하면 물리치료사·작업치료사가 있는지 봅니다.</li>
<li><b>비급여 비용</b> — 식사재료비와 상급침실료는 시설마다 다릅니다.${stats.meal.A03 ? ` 전국 요양원의 하루 식사재료비 중간값은 ${won(stats.meal.A03)}입니다.` : ""}</li>
<li><b>평가등급과 행정처분</b> — 국민건강보험공단이 정기적으로 시설을 평가해 A~E등급을 매깁니다. <a href="https://www.longtermcare.or.kr" target="_blank" rel="noopener nofollow">노인장기요양보험 누리집</a>의 '장기요양기관 찾기'에서 평가 결과와 행정처분 내역을 볼 수 있습니다.</li>
</ol>
<p>1~4번은 <a href="../index.html">요양기관 찾기</a>에서 지역을 고르면 시설별로 볼 수 있습니다.</p>
<h2>직접 방문해서 볼 것</h2>
<ol class="steps" start="6">
<li><b>냄새와 표정</b> — 예고 없이 식사 시간대에 가 보세요. 방과 복도의 냄새, 어르신들의 옷차림과 표정, 직원이 어르신을 부르는 말투가 평소 돌봄의 수준을 보여 줍니다.</li>
<li><b>계약서와 비용 명세</b> — 비급여 항목이 식사재료비·상급침실료·이미용비 세 가지 안에 있는지, 기저귀값 같은 명목으로 따로 받는 돈이 없는지 확인합니다. 면회 방법, 병원에 가야 할 때 누가 동행하는지, 퇴소할 때의 정산 방법도 물어보세요.</li>
</ol>
<h2>집에서 가까운 곳이 좋은 이유</h2>
<p>가족이 자주 찾아갈 수 있는 거리가 가장 확실한 안전장치입니다. 시설 조건이 비슷하다면 가까운 곳을 고르세요.</p>
<p><a class="cta" href="../cost.html">한 달 비용 계산하기 →</a></p>`,
  },
  {
    slug: "copay-reduction",
    alt: "식탁에서 계산기와 고지서를 앞에 두고 웃고 있는 아버지와 딸",
    title: "장기요양 본인부담금 감경: 40%·60% 덜 내는 대상",
    description: "장기요양 본인부담금은 소득 수준에 따라 40% 또는 60% 줄어들고, 기초생활수급자는 내지 않습니다. 감경 뒤 실제 부담률과 금액을 정리했습니다.",
    body: (R) => {
      const g3 = R.facility.A03.byGrade[3] * 30;
      const row = (k) => `<tr><td>${esc(R.share[k].label)}</td><td>${Math.round(R.share[k].rate[0] * 100)}%</td><td>${Math.round(R.share[k].rate[1] * 100)}%</td><td>${won(g3 * R.share[k].rate[0])}</td></tr>`;
      return `
<p>장기요양 급여비용 가운데 본인이 내는 비율은 시설 20%, 재가 15%가 기본이지만, 소득이 낮으면 이 금액의 40% 또는 60%를 덜 냅니다.</p>
<table class="src t"><tr><th>구분</th><th>시설급여 부담률</th><th>재가급여 부담률</th><th>요양원 3등급 30일</th></tr>
${["normal", "cut40", "cut60", "free"].map(row).join("")}</table>
<h2>누가 대상인가</h2>
<ul>
<li><b>본인부담 없음</b> — 국민기초생활보장법에 따른 의료급여 수급자.</li>
<li><b>60% 감경</b> — 그 밖의 의료급여 수급권자, 차상위 본인부담 경감 대상자, 건강보험료 순위가 낮은 구간(하위 25% 이하)에 해당하는 사람 등.</li>
<li><b>40% 감경</b> — 건강보험료 순위가 그다음 구간(25% 초과 50% 이하)에 해당하는 사람.</li>
</ul>
<p>건강보험료 기준 감경에는 재산 기준도 함께 적용되고, 기준 금액은 해마다 바뀝니다. 대상이 되는지는 국민건강보험공단(1577-1000)이나 지사에서 바로 확인할 수 있습니다.</p>
<h2>감경이 적용되지 않는 돈</h2>
<ul>
<li><b>비급여</b>(식사재료비, 상급침실료, 이·미용비)는 감경 대상이 아니며 전액 본인이 냅니다.</li>
<li>재가급여에서 <b>월 한도액을 넘겨 쓴 금액</b>도 전액 본인 부담입니다.</li>
</ul>
<p>그래서 감경 대상이어도 실제 한 달 부담은 식사재료비에 따라 크게 달라집니다.</p>
<p><a class="cta" href="../cost.html">감경을 넣어 한 달 비용 계산하기 →</a></p>`;
    },
  },
];

function guidePage(g, R, stats, sample) {
  const body = `<div class="crumb"><a href="../index.html">요양기관 찾기</a> › 안내</div>
<h1>${esc(g.title)}</h1>
<p class="lead">${esc(g.description)}</p>
${heroImg(g.slug, g.alt, "../../")}
${g.body(R, stats)}
<h2>다른 안내</h2>
<ul><li><a href="../cost.html">요양원·주간보호센터 비용 계산기</a></li>${GUIDES.filter((x) => x.slug !== g.slug).map((x) => `<li><a href="${x.slug}.html">${esc(x.title)}</a></li>`).join("")}</ul>
<p class="lead" style="font-size:13px">${R.year}년 기준 · 확인일 ${todayKST()}</p>`;
  const article = { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, dateModified: todayKST(), author: { "@type": "Organization", name: CONFIG.siteName }, mainEntityOfPage: `${CONFIG.siteUrl}/care/g/${g.slug}.html` };
  const faq = g.faq ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } : null;
  return layout({
    title: `${g.title} | ${CONFIG.siteName}`, description: g.description,
    canonical: `${CONFIG.siteUrl}/care/g/${g.slug}.html`, body: scrollTables(body), sample, base: "../../", source: SOURCE(R), image: CARE_OG,
    jsonLd: faq ? [article, faq] : article,
  });
}

export const guideLinks = () => GUIDES.map((g) => ({ slug: g.slug, title: g.title }));

// write(rel, html) 로 페이지를 쓰고, 만든 URL 목록을 돌려준다
export function buildCareGuides(write, { live, sample }) {
  const R = currentRates(todayKST());
  const stats = careStats(live);
  write("cost.html", costPage(R, stats, sample));
  for (const g of GUIDES) write(`g/${g.slug}.html`, guidePage(g, R, stats, sample));
  return { urls: [`${CONFIG.siteUrl}/care/cost.html`, ...GUIDES.map((g) => `${CONFIG.siteUrl}/care/g/${g.slug}.html`)], rates: R, stats };
}

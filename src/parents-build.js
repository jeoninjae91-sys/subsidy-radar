// 부모님 혜택 찾기 + 알림 신청 (/parents/)
// 부모님 출생연도와 사는 곳을 넣으면 지금 받을 수 있는 노인 혜택과 몇 년 안에 받게 될 혜택을 보여 주고,
// 새 혜택·신청 마감 알림을 이메일로 신청받는다. 신청은 workers/parents-alert 워커에 저장된다.
import { CONFIG } from "./config.js";
import { esc } from "./items.js";
import { layout } from "./build.js";

export const PARENTS_API = (process.env.PARENTS_API || "https://parents-alert.oneul-mwo-ipji-weather.workers.dev").replace(/\/$/, "");

const SIDO = /^(.+?(특별시|광역시|특별자치시|특별자치도|도))$/;
const SENIOR_NAME = /노인|어르신|장수|경로|치매|요양|기초연금|노령|시니어|효도|백세|100세|구순|팔순|고령/;
// "만 65세 이상", "80세 이상", "100세 도래", "만90세이상" → 나이 하한
const AGE = /(?:만\s*)?(\d{2,3})\s*세\s*(?:이상|이 상|부터|도래|넘|되는|된|어르신|노인|인)/;

// 소관기관명 → { sido, sigungu } (전국 사업은 둘 다 빈 값)
export function regionOf(raw) {
  const type = raw.소관기관유형 || "";
  if (type === "중앙행정기관" || type === "공공기관" || type === "교육청") return { sido: "", sigungu: "" };
  const parts = String(raw.소관기관명 || "").trim().split(/\s+/);
  if (!SIDO.test(parts[0] || "")) return null; // 지역을 알 수 없는 기관(일부 공기업 등)은 제외
  const sigungu = parts[1] && /(시|군|구)$/.test(parts[1]) ? parts[1] : "";
  return { sido: parts[0], sigungu };
}

export function minAge(raw) {
  // 지원대상을 먼저 보고, 없을 때만 선정기준을 본다
  const m = String(raw.지원대상 || "").match(AGE) || String(raw.선정기준 || "").match(AGE);
  const n = m ? Number(m[1]) : null;
  return n && n >= 55 && n <= 110 ? n : null;
}

export function seniorItems(items) {
  const out = [];
  for (const i of items) {
    const raw = i.raw || {};
    // 노인 분류가 아니면 사업 이름에 노인 관련 말이 있고 나이 조건도 있는 것만 (근로장려금의 "70세 이상 직계존속" 같은 오탐 방지)
    if (i.category !== "senior" && !SENIOR_NAME.test(i.name)) continue;
    const age = minAge(raw);
    if (i.category !== "senior" && !age) continue;
    const reg = regionOf(raw);
    if (!reg) continue;
    if (i.dday !== null && i.dday < 0) continue; // 이미 마감
    out.push({
      s: i.slug, n: i.name, u: i.summary || "", a: i.amount_text || "",
      g: age, r: reg.sido, q: reg.sigungu, d: i.always_open ? "" : i.deadline || "", v: i.views || 0,
    });
  }
  return out.sort((a, b) => b.v - a.v);
}

export function buildParents(write, items, { sample }) {
  const list = seniorItems(items);
  const sidos = [...new Set(list.map((x) => x.r).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const sgg = {};
  for (const x of list) if (x.r && x.q) (sgg[x.r] ||= new Set()).add(x.q);
  const regions = Object.fromEntries(sidos.map((s) => [s, [...(sgg[s] || [])].sort((a, b) => a.localeCompare(b, "ko"))]));
  write("parents/data.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), regions, items: list }));

  const nation = list.filter((x) => !x.r).length;
  const canonical = `${CONFIG.siteUrl}/parents/`;
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear - 55; y >= thisYear - 105; y--) years.push(y);

  const body = `<div class="crumb"><a href="../index.html">홈</a> › 부모님 혜택 찾기</div>
<h1>부모님이 받을 수 있는 혜택, 1분 만에 찾기</h1>
<p class="lead">부모님 출생연도와 사시는 곳만 고르면, 지금 신청할 수 있는 노인 혜택과 몇 년 안에 받게 될 혜택을 정리해 드려요. 정부·지자체 노인 지원사업 ${list.length.toLocaleString()}건(전국 ${nation}건 포함)에서 찾습니다.</p>
<form id="pf" class="fact" style="margin:16px 0">
<label>부모님 출생연도<br><select id="py" required style="font-size:16px;padding:8px;margin:4px 0 10px;width:100%">
<option value="">고르세요</option>${years.map((y) => `<option value="${y}">${y}년생 (${thisYear - y}세)</option>`).join("")}</select></label>
<label>사시는 곳<br><select id="ps" required style="font-size:16px;padding:8px;margin:4px 0 6px;width:100%"><option value="">시·도</option>${sidos.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
<select id="pg" style="font-size:16px;padding:8px;margin:0 0 10px;width:100%"><option value="">시·군·구 (모르면 비워 두세요)</option></select></label>
<button class="cta" type="submit" style="border:0;cursor:pointer;font-size:16px;width:100%">혜택 찾기</button>
</form>
<div id="pr" hidden>
<h2 id="pr-now-h">지금 신청할 수 있는 혜택</h2><p class="lead" id="pr-now-n"></p><ul class="list" id="pr-now"></ul>
<h2 id="pr-soon-h">곧 받게 될 혜택</h2><p class="lead">부모님 연세가 기준에 닿는 해를 미리 알려 드려요.</p><ul class="list" id="pr-soon"></ul>
<p class="lead" style="font-size:14px;margin-top:12px">나이만 보고 고른 목록이에요. 소득·거주 기간 같은 다른 조건은 각 혜택을 눌러 원문에서 꼭 확인하세요.</p>
</div>
<section id="alert" class="fact" style="margin:28px 0;border-color:var(--accent)">
<h2 style="margin-top:0">새 혜택과 신청 마감, 놓치지 않게 알려 드릴게요</h2>
<p>부모님 지역에 새 혜택이 생기거나, 신청 마감이 다가오거나, 부모님 연세가 새 혜택 기준에 닿으면 이메일로 알려 드려요. 무료이고 언제든 한 번에 해지할 수 있어요.</p>
<form id="af">
<input id="ae" type="email" required placeholder="받으실 이메일 주소" autocomplete="email" style="font-size:16px;padding:10px;width:100%;margin:4px 0 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text)">
<label style="font-size:14px;display:block;margin-bottom:8px"><input id="ac" type="checkbox" required> (필수) 알림 발송을 위해 이메일, 부모님 출생연도, 지역을 수집·이용하는 데 동의합니다. 해지하면 즉시 삭제됩니다. <a href="../privacy.html">자세히</a></label>
<button class="cta" type="submit" style="border:0;cursor:pointer;font-size:16px;width:100%">알림 받기</button>
<p id="am" class="lead" aria-live="polite"></p>
</form>
</section>
<script>
(function(){
var API=${JSON.stringify(PARENTS_API)},Y=${thisYear},D=null,from=(new URLSearchParams(location.search).get("from")||document.referrer.replace(/^https?:\\/\\/([^/]+).*/,"$1")||"direct").slice(0,30);
function ev(k){try{fetch(API+"/ev?k="+k,{mode:"no-cors",keepalive:true})}catch(e){}}
ev("view");
var $=function(id){return document.getElementById(id)};
fetch("data.json").then(function(r){return r.json()}).then(function(j){D=j});
$("ps").addEventListener("change",function(){var g=$("pg");g.innerHTML='<option value="">시·군·구 (모르면 비워 두세요)</option>';var l=(D&&D.regions[this.value])||[];l.forEach(function(x){var o=document.createElement("option");o.textContent=x;g.appendChild(o)})});
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function row(x,badge){return '<li class="item"><div class="body"><a class="title" href="../s/'+x.s+'.html">'+esc(x.n)+'</a><div class="sum">'+esc(x.u)+(x.a?' · '+esc(x.a):'')+'</div></div><span class="badge'+(badge.ok?' ok':'')+'">'+esc(badge.t)+'</span></li>'}
$("pf").addEventListener("submit",function(e){e.preventDefault();if(!D)return;var y=+$("py").value,s=$("ps").value,g=$("pg").value,age=Y-y;
var mine=D.items.filter(function(x){return !x.r||(x.r===s&&(!x.q||!g||x.q===g))});
var rank=function(x){return x.q?0:x.r?1:2};
var now=mine.filter(function(x){return !x.g||x.g<=age}).sort(function(a,b){return rank(a)-rank(b)||b.v-a.v}),soon=mine.filter(function(x){return x.g&&x.g>age&&x.g-age<=10}).sort(function(a,b){return a.g-b.g});
var near=function(x){return x.r?(x.q?x.q:x.r):"전국"};
$("pr-now").innerHTML=now.slice(0,60).map(function(x){return row(x,{t:near(x),ok:!!x.r})}).join("")||'<li class="item">찾은 혜택이 없어요.</li>';
$("pr-now-n").textContent="모두 "+now.length+"건"+(now.length>60?" 중 많이 찾는 60건을 보여 드려요.":"이에요.")+(g?"":" 시·군·구를 고르면 동네 혜택이 더 정확해져요.");
$("pr-soon").innerHTML=soon.slice(0,30).map(function(x){return row(x,{t:(y+x.g)+"년 ("+x.g+"세)"})}).join("")||'<li class="item"><div class="body">지금 이 지역에는 10년 안에 새로 받게 될 나이 기준 혜택이 없어요. 다른 지역에는 있는 효도수당·장수축하금 같은 혜택이 새로 생기면 바로 알려 드릴게요. <a href="#alert">알림 받기 ↓</a></div></li>';
$("pr").hidden=false;ev("search");$("pr").scrollIntoView({behavior:"smooth"});});
var opened=false;$("ae").addEventListener("focus",function(){if(!opened){opened=true;ev("signup_open")}});
$("af").addEventListener("submit",function(e){e.preventDefault();var m=$("am"),y=+$("py").value,s=$("ps").value;
if(!y||!s){m.textContent="위에서 부모님 출생연도와 사시는 곳을 먼저 골라 주세요.";$("pf").scrollIntoView({behavior:"smooth"});return}
m.textContent="저장하는 중…";
fetch(API+"/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:$("ae").value,birthYear:y,sido:s,sigungu:$("pg").value,consent:$("ac").checked,from:from})})
.then(function(r){return r.json()}).then(function(j){m.textContent=j.ok?"신청됐어요. "+s+" "+(Y-y)+"세 부모님 기준으로 알려 드릴게요.":(j.error||"잠시 뒤 다시 시도해 주세요.")})
.catch(function(){m.textContent="연결이 잠시 불안정해요. 잠시 뒤 다시 시도해 주세요."})});
})();
</script>`;

  write("parents/index.html", layout({
    title: `부모님 혜택 찾기 — 나이·지역으로 받을 수 있는 노인 지원금 | ${CONFIG.siteName}`,
    description: "부모님 출생연도와 사시는 곳만 고르면 지금 받을 수 있는 노인 혜택과 곧 받게 될 혜택(장수축하금·기초연금 등)을 정리해 드려요. 신청 마감 알림도 받을 수 있어요.",
    canonical, body, sample, base: "../",
  }));
  return { urls: [canonical], count: list.length };
}

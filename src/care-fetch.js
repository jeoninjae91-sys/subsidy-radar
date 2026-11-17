// 돌봄 1단계: 장기요양기관 수집 (국민건강보험공단, data.go.kr)
//  - 목록:  15059029 장기요양기관 검색 서비스        → 시도별 전체 기관 (매 실행)
//  - 상세:  15058856 장기요양기관 시설별 상세조회 서비스 → 입소·통원 시설만, 하루 CARE_DETAIL_LIMIT곳씩 오래된 것부터
//  - 지역명: 15077871 행정표준코드 법정동코드          → 코드 → 시군구·읍면동 이름 (최초 1회, 이후 90일마다)
// 세 API 모두 공공데이터포털에서 각각 "활용신청"을 해야 같은 인증키로 호출된다.
import fs from "node:fs";
import { CONFIG, isMain, readJson, writeJson, todayKST } from "./config.js";
import { CARE_PATHS, SIDO, isFacilityType, typeName } from "./care-common.js";

const LIST_URL = "https://apis.data.go.kr/B550928/searchLtcInsttService02/getLtcInsttSeachList02";
const DETAIL_URL = "https://apis.data.go.kr/B550928/getLtcInsttDetailInfoService02/";
const REGION_URL = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList";

const DETAIL_OPS = {
  general: "getGeneralSttusDetailInfoItem02", // 주소·전화·지정일
  people: "getAceptncNmprDetailInfoItem02", // 정원·현원·대기
  staff: "getStaffSttusDetailInfoItem02", // 인력
  etc: "getInsttEtcDetailInfoItem02", // 홈페이지·교통편·주차
  nonpay: "getNonBenefitSttusDetailInfoList02", // 비급여 항목(목록)
};

const DETAIL_LIMIT = Number(process.env.CARE_DETAIL_LIMIT || 600); // 하루에 상세를 새로 받을 기관 수
const REFRESH_DAYS = Number(process.env.CARE_REFRESH_DAYS || 30); // 상세 정보 재확인 주기
const CONCURRENCY = 1; // 초당 호출 제한(오류 23)이 빡빡해서 한 줄로 보낸다
const MIN_GAP_MS = Number(process.env.CARE_MIN_GAP_MS || 300); // 호출 사이 최소 간격

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = String(code);
  }
}

const decode = (s) =>
  s.trim().replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

// data.go.kr 표준 XML 응답 → { items: [{태그: 값}], total }
export function parseXml(xml) {
  const gate = xml.match(/<returnReasonCode>(\d+)</); // 게이트웨이 오류(키 미등록 30, 트래픽 초과 22 등)
  if (gate) throw new ApiError(gate[1], (xml.match(/<returnAuthMsg>([^<]*)/) || [])[1] || "API 오류");
  const rc = (xml.match(/<resultCode>([^<]*)/) || [])[1];
  if (rc && !/^0+$/.test(rc) && rc !== "03" && rc !== "3") throw new ApiError(rc, (xml.match(/<resultMsg>([^<]*)/) || [])[1] || "API 오류");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/<([\w.-]+)>([\s\S]*?)<\/\1>/g)].map((x) => [x[1], decode(x[2])])),
  );
  const total = Number((xml.match(/<totalCount>(\d+)</) || [])[1] || items.length);
  return { items, total };
}

// 모든 호출을 한 줄로 세워 최소 간격을 지킨다
let gate = Promise.resolve();
const throttle = () => (gate = gate.then(() => new Promise((r) => setTimeout(r, MIN_GAP_MS))));

export async function get(base, params) {
  const url = new URL(base);
  url.searchParams.set("serviceKey", CONFIG.dataKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; ; attempt++) {
    try {
      await throttle();
      const res = await fetch(url);
      const text = await res.text();
      // 초당 요청 제한(23, HTTP 429)이나 서버 오류면 잠깐 쉬고 다시
      if ((res.status === 429 || res.status >= 500 || /<returnReasonCode>23</.test(text)) && attempt < 6) throw new Error(`HTTP ${res.status}`);
      return text;
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// ── 목록: 시도별 전체 기관
async function fetchList(inst) {
  const today = todayKST();
  const run = new Set(); // 이번 실행에서 본 기관 (같은 날 다시 돌려도 페이지 넘김이 끊기지 않게)
  let seen = 0;
  for (const sido of Object.keys(SIDO)) {
    let got = 0;
    for (let pageNo = 1; ; pageNo++) {
      const { items, total } = parseXml(await get(LIST_URL, { siDoCd: sido, pageNo, numOfRows: 1000 }));
      let fresh = 0;
      for (const r of items) {
        if (!r.longTermAdminSym) continue;
        const id = `${r.longTermAdminSym}-${r.adminPttnCd || "X"}`;
        const prev = inst[id];
        if (!run.has(id)) fresh++;
        run.add(id);
        inst[id] = {
          ...prev, id, sym: r.longTermAdminSym, pttn: r.adminPttnCd || "", name: r.adminNm || "",
          sido: r.siDoCd || sido, sgg: r.siGunGuCd || "", designated: r.longTermPeribRgtDt || "", registered: r.stpRptDt || "",
          firstSeen: prev?.firstSeen || today, gone: false,
        };
      }
      got += items.length;
      if (!items.length || !fresh || got >= total) break; // fresh=0 이면 페이지 넘김이 안 먹는 것 → 무한 반복 방지
    }
    if (got) console.log(`[care] ${SIDO[sido]}(${sido}): ${got}곳`);
    seen += got;
  }
  // 목록 전체를 끝까지 받은 경우에만: 오늘 안 보인 기관은 폐업·지정취소로 본다
  if (seen) for (const r of Object.values(inst)) if (!run.has(r.id)) r.gone = true;
  return seen;
}

// ── 상세: 시설 유형만, 안 받아 본 곳 → 오래된 곳 순서로 하루 한도만큼
async function fetchDetails(inst) {
  const cutoff = new Date(Date.now() + 9 * 3600e3 - REFRESH_DAYS * 86400e3).toISOString().slice(0, 10);
  const queue = Object.values(inst)
    .filter((r) => !r.gone && isFacilityType(r.pttn) && (!r.detail || r.detail.checkedAt < cutoff))
    .sort((a, b) => (a.detail?.checkedAt || "").localeCompare(b.detail?.checkedAt || ""))
    .slice(0, DETAIL_LIMIT);

  let done = 0, failed = 0, quota = false;
  const reasons = {}; // 실패 사유별 건수 (로그용)
  async function one(r) {
    const q = { longTermAdminSym: r.sym, adminPttnCd: r.pttn };
    const d = { checkedAt: todayKST() };
    for (const [key, op] of Object.entries(DETAIL_OPS)) {
      const params = key === "nonpay" ? { longTermAdminSym: r.sym, pageNo: 1, numOfRows: 100 } : q;
      const { items } = parseXml(await get(DETAIL_URL + op, params));
      // 응답에 반복되는 식별 필드는 저장하지 않는다(파일 크기)
      for (const it of items) for (const k of ["longTermAdminSym", "adminPttnCd"]) delete it[k];
      d[key] = key === "nonpay" ? items.filter((x) => Number(x.nonpayTgtAmt) > 0) : items[0] || null;
    }
    if (!d.general && !d.people) throw new Error("상세 응답이 비어 있음");
    r.detail = d;
    done++;
  }
  async function worker() {
    while (queue.length && !quota) {
      const r = queue.shift();
      try {
        await one(r);
      } catch (e) {
        if (e instanceof ApiError && e.code === "22") quota = true; // 일일 트래픽 초과 → 내일 이어서
        else if (e instanceof ApiError && e.code === "30") throw e;
        else {
          failed++;
          const why = `${e.code ? `[${e.code}] ` : ""}${e.message}`;
          reasons[why] = (reasons[why] || 0) + 1;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  for (const [why, cnt] of Object.entries(reasons)) console.log(`[care] 상세 실패 ${cnt}건: ${why}`);
  if (quota) console.log("[care] 상세조회 일일 트래픽 한도에 도달 → 나머지는 다음 실행에서 이어서 받습니다.");
  return { done, failed, left: Object.values(inst).filter((r) => !r.gone && isFacilityType(r.pttn) && !r.detail).length };
}

// ── 지역명: 법정동코드 → 이름
async function fetchRegions() {
  const state = readJson(CARE_PATHS.state, {});
  const have = readJson(CARE_PATHS.regions, {});
  const age = state.regionsAt ? (Date.now() - Date.parse(state.regionsAt)) / 86400e3 : Infinity;
  if (Object.keys(have).length && age < 90) return Object.keys(have).length;

  const regions = {};
  for (const name of new Set(Object.values(SIDO))) { // 시도 이름으로 검색 → 그 아래 시군구·읍면동까지
    for (let pageNo = 1; ; pageNo++) {
      const text = await get(REGION_URL, { type: "json", pageNo, numOfRows: 1000, locatadd_nm: name });
      if (text.trimStart().startsWith("<")) parseXml(text); // 오류면 여기서 throw
      const json = JSON.parse(text);
      const rows = json.StanReginCd?.[1]?.row || [];
      const total = Number(json.StanReginCd?.[0]?.head?.[0]?.totalCount || 0);
      for (const r of rows) if (r.region_cd && r.locatadd_nm && (r.ri_cd === undefined || r.ri_cd === "00")) regions[r.region_cd] = r.locatadd_nm;
      if (rows.length < 1000 || pageNo * 1000 >= total) break;
    }
  }
  if (!Object.keys(regions).length) throw new Error("법정동코드 응답에서 지역을 하나도 읽지 못했습니다.");
  writeJson(CARE_PATHS.regions, regions);
  writeJson(CARE_PATHS.state, { ...state, regionsAt: new Date().toISOString() });
  return Object.keys(regions).length;
}

// 기관 1곳을 1줄로 저장 (git 변경분이 바뀐 기관만 남도록)
function saveInst(inst) {
  const lines = Object.keys(inst).sort().map((k) => {
    const { seenAt, ...r } = inst[k];
    return `${JSON.stringify(k)}:${JSON.stringify(r)}`;
  });
  fs.writeFileSync(CARE_PATHS.data, "{\n" + lines.join(",\n") + "\n}\n", "utf8");
}

export async function fetchCare() {
  if (!CONFIG.dataKey) {
    console.log("[care] DATA_GO_KR_KEY 없음 → 수집 건너뜀 (미리보기는 샘플로 생성됩니다).");
    return { skipped: true };
  }
  const inst = readJson(CARE_PATHS.data, {});
  try {
    const seen = await fetchList(inst);
    if (!seen) throw new Error("목록 응답에서 기관을 하나도 읽지 못했습니다. 응답 형식을 확인하세요.");
    saveInst(inst);

    try {
      console.log(`[care] 지역명 ${await fetchRegions()}개`);
    } catch (e) {
      console.log(`[care] 지역명(법정동코드) 수집 실패 → 코드로 표시됩니다: ${e.message}`);
    }

    const d = await fetchDetails(inst);
    saveInst(inst);

    // 기관유형 코드표 검증용: 코드별 기관 수와 이름 예시
    const byType = {};
    for (const r of Object.values(inst)) if (!r.gone) (byType[r.pttn] ||= []).push(r.name);
    for (const [code, names] of Object.entries(byType).sort()) console.log(`[care]   ${code} ${typeName(code)}: ${names.length}곳 (예: ${names.slice(0, 3).join(", ")})`);

    return { total: Object.values(inst).filter((r) => !r.gone).length, ...d };
  } catch (e) {
    if (e instanceof ApiError && e.code === "30") {
      console.log("[care] 인증키가 이 API에 등록되어 있지 않습니다. 공공데이터포털에서 아래 3개를 '활용신청' 하세요 (같은 키로 자동 적용):\n  · https://www.data.go.kr/data/15059029/openapi.do  장기요양기관 검색 서비스\n  · https://www.data.go.kr/data/15058856/openapi.do  장기요양기관 시설별 상세조회 서비스\n  · https://www.data.go.kr/data/15077871/openapi.do  행정표준코드 법정동코드");
      return { skipped: true, needApproval: true };
    }
    throw e;
  }
}

if (isMain(import.meta.url)) {
  const r = await fetchCare();
  if (!r.skipped) console.log(`[care] 완료: 운영 중 ${r.total}곳 · 오늘 상세 ${r.done}곳(실패 ${r.failed}) · 상세 대기 ${r.left}곳`);
}

// 가격 1단계: 비급여 진료비 수집 (건강보험심사평가원, data.go.kr 15001700 비급여진료비정보조회서비스)
//  - 코드:  getNonPaymentItemCodeList2  → 비급여 항목 코드 전체에서 발행 항목(ITEMS)에 해당하는 코드 고르기
//  - 가격:  getNonPaymentItemHospList2  → 코드별 의료기관 목록과 신고 금액(최저·최고)
// 공공데이터포털에서 "활용신청"을 해야 같은 인증키로 호출된다. 가격은 자주 바뀌지 않아 PRICE_REFRESH_DAYS마다 다시 받는다.
import fs from "node:fs";
import crypto from "node:crypto";
import { CONFIG, isMain, readJson, todayKST } from "./config.js";
import { ApiError, get, parseXml } from "./care-fetch.js";
import { ITEMS, PRICE_PATHS } from "./price-common.js";

const BASE = "https://apis.data.go.kr/B551182/nonPaymentDamtInfoService/";
const REFRESH_DAYS = Number(process.env.PRICE_REFRESH_DAYS || 7);
const ROWS = 500; // 한 번에 받을 건수

// 페이지를 끝까지 넘기며 전부 받기. 새 항목이 하나도 없으면(페이지 넘김이 안 먹으면) 멈춘다.
async function fetchAll(op, params, keyOf) {
  const seen = new Map();
  for (let pageNo = 1; pageNo <= 400; pageNo++) {
    const { items, total } = parseXml(await get(BASE + op, { ...params, pageNo, numOfRows: ROWS }));
    let fresh = 0;
    for (const it of items) {
      const k = keyOf(it);
      if (!k) continue;
      if (!seen.has(k)) fresh++;
      seen.set(k, it);
    }
    if (!items.length || !fresh || pageNo * ROWS >= total) break;
  }
  return [...seen.values()];
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
// 암호화된 요양기호는 수백 자라 짧은 해시로 줄여 기관 식별자로만 쓴다
const shortId = (ykiho) => crypto.createHash("sha1").update(String(ykiho)).digest("hex").slice(0, 12);

function save(data) {
  const items = Object.entries(data.items).map(([slug, it]) => {
    const rows = it.rows.map((r) => `      ${JSON.stringify(r)}`).join(",\n"); // 기관 1곳 1줄 (git 변경분이 작게)
    return `    ${JSON.stringify(slug)}: {"codes": ${JSON.stringify(it.codes)}, "rows": [\n${rows}\n    ]}`;
  });
  fs.writeFileSync(PRICE_PATHS.data, `{\n  "fetchedAt": ${JSON.stringify(data.fetchedAt)},\n  "items": {\n${items.join(",\n")}\n  }\n}\n`, "utf8");
}

export async function fetchPrice({ force = false } = {}) {
  if (!CONFIG.dataKey) {
    console.log("[price] DATA_GO_KR_KEY 없음 → 수집 건너뜀 (미리보기는 샘플로 생성됩니다).");
    return { skipped: true };
  }
  const prev = readJson(PRICE_PATHS.data, null);
  const age = prev?.fetchedAt ? (Date.parse(todayKST()) - Date.parse(prev.fetchedAt)) / 86400e3 : Infinity;
  if (!force && age < REFRESH_DAYS) return { skipped: true, fresh: true, fetchedAt: prev.fetchedAt };

  try {
    const codes = await fetchAll("getNonPaymentItemCodeList2", {}, (c) => c.npayCd);
    if (!codes.length) throw new Error("비급여 항목 코드를 하나도 읽지 못했습니다. 응답 형식을 확인하세요.");
    const today = todayKST().replaceAll("-", "");
    const data = { fetchedAt: todayKST(), items: {} };
    const out = {};
    for (const [slug, item] of Object.entries(ITEMS)) {
      // 적용이 끝난 코드는 제외
      const mine = codes.filter((c) => item.match.test(c.npayKorNm || "") && (!c.adtEndDd || c.adtEndDd >= today));
      const rows = [];
      for (const c of mine) {
        const hosp = await fetchAll("getNonPaymentItemHospList2", { itemCd: c.npayCd }, (h) => (h.ykiho ? `${h.ykiho}|${h.npayCd || c.npayCd}` : ""));
        for (const h of hosp) {
          const min = num(h.minPrc) || num(h.maxPrc);
          if (!min || !h.yadmNm || !h.sidoCd) continue;
          rows.push({
            y: shortId(h.ykiho), name: h.yadmNm.trim(), cl: h.clCdNm || "", sido: h.sidoCd, sidoNm: h.sidoCdNm || "", sggu: h.sgguCd || "", sgguNm: h.sgguCdNm || "",
            code: h.npayCd || c.npayCd, min, max: Math.max(num(h.maxPrc), min), from: h.adtFrDd || "",
          });
        }
        console.log(`[price]   ${c.npayCd} ${c.npayKorNm}: ${hosp.length}곳`);
      }
      rows.sort((a, b) => a.sido.localeCompare(b.sido) || a.sggu.localeCompare(b.sggu) || a.name.localeCompare(b.name, "ko") || a.code.localeCompare(b.code));
      data.items[slug] = { codes: Object.fromEntries(mine.map((c) => [c.npayCd, { name: c.npayKorNm || "", note: c.cmmtTxt || "" }])), rows };
      out[slug] = { codes: mine.length, rows: rows.length, hospitals: new Set(rows.map((r) => r.y)).size };
    }
    // 하나도 못 받았으면 기존 데이터를 지우지 않는다
    if (!Object.values(out).some((o) => o.rows)) throw new Error("가격을 하나도 읽지 못했습니다. 항목 코드나 응답 형식을 확인하세요.");
    save(data);
    return { items: out, allCodes: codes.length };
  } catch (e) {
    if (e instanceof ApiError && e.code === "30") {
      console.log("[price] 인증키가 이 API에 등록되어 있지 않습니다. 공공데이터포털에서 '활용신청' 하세요 (같은 키로 자동 적용):\n  · https://www.data.go.kr/data/15001700/openapi.do  건강보험심사평가원 비급여진료비정보조회서비스");
      return { skipped: true, needApproval: true };
    }
    throw e;
  }
}

if (isMain(import.meta.url)) {
  const r = await fetchPrice({ force: true });
  if (!r.skipped) for (const [slug, o] of Object.entries(r.items)) console.log(`[price] 완료: ${ITEMS[slug].name} — 코드 ${o.codes}개 · 의료기관 ${o.hospitals}곳 · 가격 ${o.rows}건 (전체 비급여 코드 ${r.allCodes}개)`);
}

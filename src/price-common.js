// 비급여 진료비(예방접종 가격) 섹션 공통: 경로, 항목 정의, 데이터 로더, 통계
// 시험판: 항목 하나(대상포진 예방접종)만 전국 시군구로 발행해 검색 노출을 확인한다.
import path from "node:path";
import { ROOT, readJson } from "./config.js";

export const PRICE_PATHS = {
  data: path.join(ROOT, "data", "price.json"),
  fixture: path.join(ROOT, "fixtures", "sample-price.json"),
};

// 발행 항목. match: 심평원 비급여 항목명(npayKorNm)에서 이 항목에 속하는 코드를 고르는 정규식.
// 항목을 늘릴 때는 여기에 한 줄 추가하면 수집·발행이 같이 늘어난다.
//  - short: 항목명 끝 조각이 이것과 같으면 "종류 구분 없음"으로 본다
//  - before: "○○ 전에 확인하세요" 제목에 들어갈 말
//  - why: 병원마다 금액이 다른 까닭 (자주 묻는 질문 답변)
//  - tips: 항목에만 해당하는 확인 사항 (HTML 허용 — 여기 적는 글은 우리가 쓴 글뿐이다)
//  - spread: [아래, 위] 같은 종류 전국 중간 금액의 몇 배까지를 정상 금액으로 볼지. 금액 편차가 원래 큰 항목은 넓게 잡는다.
export const ITEMS = {
  shingles: {
    name: "대상포진 예방접종", short: "대상포진", match: /^예방접종료\/대상포진/, before: "접종", spread: [0.4, 3],
    why: "백신 종류와 접종 횟수에 따라서도 차이가 납니다.",
    tips: [
      "방문 전에 백신 재고도 함께 확인하세요.",
      "대상포진 백신은 종류에 따라 접종 횟수와 금액이 다릅니다. 어떤 백신을 몇 번 맞는지는 의료진과 상의하세요.",
      '지자체에 따라 어르신·취약계층에게 접종비를 지원하기도 합니다. 주소지 보건소에 문의하거나 <a href="../../c/senior.html">노인 대상 지원금</a>을 함께 확인하세요.',
    ],
  },
  "mri-knee": {
    name: "무릎 MRI", short: "근골격계-슬관절", match: /^자기공명영상진단료\(MRI-기본검사\)\/근골격계-슬관절/, before: "검사", spread: [0.3, 3],
    why: "장비와 촬영 범위, 조영제 사용 여부에 따라서도 차이가 납니다.",
    tips: ["MRI는 진단과 증상에 따라 건강보험이 적용되기도 합니다. 이 표는 건강보험이 적용되지 않을 때(비급여)의 금액이며, 적용 여부는 진료받는 의료기관에 확인하세요."],
  },
  "mri-lumbar": {
    name: "허리 MRI", short: "척추-요천추", match: /^자기공명영상진단료\(MRI-기본검사\)\/척추-요천추/, before: "검사", spread: [0.3, 3],
    why: "장비와 촬영 범위, 조영제 사용 여부에 따라서도 차이가 납니다.",
    tips: ["MRI는 진단과 증상에 따라 건강보험이 적용되기도 합니다. 이 표는 건강보험이 적용되지 않을 때(비급여)의 금액이며, 적용 여부는 진료받는 의료기관에 확인하세요."],
  },
  manual: {
    name: "도수치료", short: "도수치료", match: /^이학요법료\/도수치료/, before: "치료", spread: [0.1, 6],
    why: "치료 시간과 부위, 치료사에 따라서도 차이가 납니다.",
    tips: ["도수치료는 1회 치료 시간과 부위에 따라 금액이 달라, 한 의료기관 안에서도 금액 폭이 넓습니다. 표의 금액이 몇 분 기준인지 의료기관에 물어보세요."],
  },
  "room-1": {
    name: "1인실 병실료", short: "1인실", match: /^상급병실료\/1인실/, before: "입원", spread: [0.05, 6],
    why: "병실 크기와 시설에 따라서도 차이가 납니다.",
    tips: ["표의 금액은 의료기관이 신고한 1인실 병실료이며, 같은 병원 안에서도 병실에 따라 금액이 다를 수 있습니다. 입원 일수만큼 더해집니다."],
  },
};

// 시군구 단독 페이지를 만드는 최소 기관 수 (그보다 적으면 시도 페이지에만 싣는다)
export const MIN_SGGU_ROWS = 3;

// "예방접종료/대상포진/싱그릭스주" → "싱그릭스주" (항목명 끝 조각이 백신·세부 구분)
export function kindLabel(name, item) {
  const parts = String(name || "").split("/").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return !last || last === item.short || last === item.name ? "구분 없음" : last;
}

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

// 기관 한 곳의 대표 가격 = 신고한 최저 금액
export function stats(rows) {
  const p = rows.map((r) => r.min).filter((v) => v > 0);
  return p.length ? { n: new Set(rows.map((r) => r.y)).size, min: Math.min(...p), max: Math.max(...rows.map((r) => r.max || r.min)), mid: median(p) } : null;
}

// 실데이터가 없으면 샘플(fixtures)로 — 샘플은 미리보기 전용이고 실제 사이트에는 발행하지 않는다
export function loadPrice() {
  const real = readJson(PRICE_PATHS.data, null);
  if (real && Object.values(real.items || {}).some((it) => it.rows?.length)) return { ...real, sample: false };
  return { ...readJson(PRICE_PATHS.fixture, { items: {} }), sample: true };
}

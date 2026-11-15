// 부모님 돌봄(장기요양기관) 섹션 공통: 경로, 코드표, 데이터 로더
import path from "node:path";
import { ROOT, readJson } from "./config.js";

export const CARE_PATHS = {
  data: path.join(ROOT, "data", "care.json"), // "기관기호-유형코드" → 기관 레코드
  regions: path.join(ROOT, "data", "care-regions.json"), // 법정동코드(10자리) → 지역 이름
  state: path.join(ROOT, "data", "care-state.json"),
  fixture: path.join(ROOT, "fixtures", "sample-care.json"),
};

// 시도 코드 (법정동코드 앞 2자리). 2026-11-15 실데이터로 확인: 광주·전남은 전남광주통합특별시(12)로 합쳐져 29·46은 0건.
export const SIDO = {
  11: "서울특별시", 12: "전남광주통합특별시", 26: "부산광역시", 27: "대구광역시", 28: "인천광역시", 30: "대전광역시",
  31: "울산광역시", 36: "세종특별자치시", 41: "경기도", 43: "충청북도", 44: "충청남도",
  47: "경상북도", 48: "경상남도", 50: "제주특별자치도", 51: "강원특별자치도", 52: "전북특별자치도",
};

// 기관유형 코드 → 이름. 2026-11-15 실데이터(기관명·정원)로 대조해 정한 표.
//  A03 정원 10명 이상 요양원, A04 정원 9명 이하 공동생활가정. B·C 계열은 같은 서비스(C는 재가노인복지시설이 운영).
//  G·H·I·M 계열은 본 기관(A03·B03 등)에 딸린 치매전담실 등 부속 단위라 목록에 따로 싣지 않는다. A05·S41은 뜻을 확인하지 못해 '기타 시설'.
export const TYPES = {
  A03: "노인요양시설(요양원)",
  A04: "노인요양공동생활가정",
  B03: "주야간보호", C03: "주야간보호",
  B04: "단기보호", C04: "단기보호",
  B01: "방문요양", C01: "방문요양",
  B02: "방문목욕", C02: "방문목욕",
  B05: "방문간호", C05: "방문간호",
  B06: "복지용구", C06: "복지용구",
  A05: "기타 시설", S41: "기타 시설",
};
export const typeName = (code) => TYPES[code] || `기관유형 ${code}`;

// 목록에 싣는 유형 (부속 단위 G·H·I·M 등은 제외)
export const isListedType = (code) => code in TYPES;

// 상세 페이지를 만드는 유형: 부모님이 직접 가서 지내는 곳(입소·통원 시설)
export const isFacilityType = (code) => ["A03", "A04", "B03", "C03", "B04", "C04"].includes(code);

// 시군구 코드: 3자리(시도 뒤에 붙는 부분)로 오든 5자리로 오든 5자리로 맞춘다
export const sggCode = (sido, sgg) => (String(sgg || "").length >= 5 ? String(sgg) : `${sido}${String(sgg || "").padStart(3, "0")}`);

export function sggFullName(regions, sido, sgg) {
  const code = sggCode(sido, sgg);
  return regions[code.padEnd(10, "0")] || `${SIDO[sido] || `시도 ${sido}`} (시군구 코드 ${code.slice(2)})`;
}
export function sggShortName(regions, sido, sgg) {
  const full = sggFullName(regions, sido, sgg);
  const sidoName = regions[String(sido).padEnd(10, "0")] || SIDO[sido] || "";
  return full.startsWith(sidoName) ? full.slice(sidoName.length).trim() || full : full;
}
export function dongFullName(regions, sido, sgg, dong) {
  if (!dong) return "";
  return regions[`${sggCode(sido, sgg)}${dong}`.padEnd(10, "0")] || "";
}

// 실데이터가 없으면 샘플(fixtures)로 — 샘플은 미리보기 전용이고 실제 사이트에는 발행하지 않는다
export function loadCare() {
  const real = readJson(CARE_PATHS.data, null);
  if (real && Object.keys(real).length) {
    return { institutions: real, regions: readJson(CARE_PATHS.regions, {}), sample: false };
  }
  const fx = readJson(CARE_PATHS.fixture, { institutions: {}, regions: {} });
  return { institutions: fx.institutions, regions: fx.regions, sample: true };
}

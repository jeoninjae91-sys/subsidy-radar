// 공통 설정: .env 로드, 경로, JSON 입출력 도우미
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const PATHS = {
  raw: path.join(ROOT, "data", "services.json"), // 서비스ID → 원본 레코드
  enriched: path.join(ROOT, "data", "enriched.json"), // 서비스ID → Claude 가공 결과
  state: path.join(ROOT, "data", "state.json"), // 마지막 수집 시각 등
  fixture: path.join(ROOT, "fixtures", "sample-services.json"),
  site: path.join(ROOT, "site"),
  newsletter: path.join(ROOT, "out"),
};

export const CONFIG = {
  dataKey: process.env.DATA_GO_KR_KEY || "", // 공공데이터포털 일반 인증키(Decoding)
  // 개인 도메인(CUSTOM_DOMAIN)이 있으면 그 주소가 우선
  siteUrl: (process.env.CUSTOM_DOMAIN ? `https://${process.env.CUSTOM_DOMAIN}` : process.env.SITE_URL || "https://example.com").replace(/\/$/, ""),
  siteName: process.env.SITE_NAME || "지원금 레이더",
  model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  concurrency: Number(process.env.ENRICH_CONCURRENCY || 4),
  enrichLimit: Number(process.env.ENRICH_LIMIT || 0), // 0 = 제한 없음 (한 번에 처리할 최대 건수)
  gaMeasurementId: process.env.GA_MEASUREMENT_ID || "G-FMRQEBW6CL", // GA4 웹 스트림 측정 ID (빈 값 "-"이면 미삽입)
  adsenseClient: process.env.ADSENSE_CLIENT || "", // ca-pub-XXXX (비우면 광고 코드 미삽입)
  customDomain: process.env.CUSTOM_DOMAIN || "", // 예: jiwongeum.kr (구매 후 설정)
  contactUrl: process.env.CONTACT_URL || "", // 비우면 사이트 안 문의 양식(운영자 연락처 노출 없음)을 쓴다
  contactApi: process.env.CONTACT_API || "https://parents-alert.oneul-mwo-ipji-weather.workers.dev/contact",
  googleVerification: process.env.GOOGLE_SITE_VERIFICATION || "", // 구글 서치콘솔 HTML 태그의 content 값
  naverVerification: process.env.NAVER_SITE_VERIFICATION || "92cb4e07dfad468fb995872ba38d5d9d3b92e016", // 네이버 서치어드바이저 HTML 태그의 content 값
};

// 분야 분류 (사이트 카테고리 = URL 슬러그)
export const CATEGORIES = {
  youth: "청년",
  housing: "주거",
  family: "출산·육아",
  job: "일자리·창업",
  smallbiz: "소상공인·기업",
  senior: "노인",
  disabled: "장애인",
  lowincome: "저소득·생활안정",
  health: "건강·의료",
  education: "교육",
  farm: "농림·어업",
  etc: "기타",
};

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// `node src/xxx.js` 로 직접 실행됐는지 (한글 경로에서도 안전)
export function isMain(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
}

export function todayKST() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

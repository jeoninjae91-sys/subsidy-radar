// 장기요양 급여비용(수가)·월 한도액 — 매년 1월 1일 바뀐다. 새 고시가 나오면 연도 블록을 하나 더 넣는다.
// 2026년: 보건복지부 「장기요양급여 제공기준 및 급여비용 산정방법 등에 관한 고시」 2026.1.1. 시행분.
//   시설 수가는 복지부 붙임 「2026년 급여유형별 장기요양수가」, 주야간보호·월 한도액은 지자체 데이케어센터 게시 요금표로 대조.
// 2027년: 2026.10.30. 장기요양위원회에서 인상 의결(등급별 표는 아직 미반영) → 표가 공개되면 2027 블록 추가.
export const RATES = {
  2026: {
    // 1일당 급여비용(원). 3~5등급은 같은 금액.
    facility: {
      A03: { name: "요양원(노인요양시설)", byGrade: { 1: 93070, 2: 86340, 3: 81540, 4: 81540, 5: 81540 } },
      A04: { name: "노인요양공동생활가정", byGrade: { 1: 74590, 2: 69210, 3: 63800, 4: 63800, 5: 63800 } },
    },
    // 주야간보호 1일당 급여비용(원): 이용시간 구간 × 등급(6 = 인지지원등급)
    dayCare: [
      { key: "3", label: "3시간 이상 ~ 6시간 미만", byGrade: { 1: 41820, 2: 38720, 3: 35740, 4: 34120, 5: 32490, 6: 32490 } },
      { key: "6", label: "6시간 이상 ~ 8시간 미만", byGrade: { 1: 56060, 2: 51930, 3: 47940, 4: 46300, 5: 44650, 6: 44650 } },
      { key: "8", label: "8시간 이상 ~ 10시간 미만", byGrade: { 1: 69730, 2: 64590, 3: 59640, 4: 58010, 5: 56360, 6: 56360 } },
      { key: "10", label: "10시간 이상 ~ 13시간 이하", byGrade: { 1: 76820, 2: 71160, 3: 65750, 4: 64090, 5: 62460, 6: 56360 } },
      { key: "13", label: "13시간 초과", byGrade: { 1: 82370, 2: 76310, 3: 70500, 4: 68860, 5: 67240, 6: 56360 } },
    ],
    // 재가급여 월 한도액(원)
    limit: { 1: 2512900, 2: 2331200, 3: 1528200, 4: 1409700, 5: 1208900, 6: 676320 },
    // 본인부담률: [시설, 재가]
    share: {
      normal: { label: "일반", rate: [0.2, 0.15] },
      cut40: { label: "40% 감경 대상", rate: [0.12, 0.09] },
      cut60: { label: "60% 감경 대상", rate: [0.08, 0.06] },
      free: { label: "기초생활수급자(본인부담 없음)", rate: [0, 0] },
    },
  },
};

// 오늘 날짜에 적용할 연도: 해당 연도 표가 없으면 가장 최근 표를 쓴다
export function currentRates(today) {
  const year = Number(String(today).slice(0, 4));
  const years = Object.keys(RATES).map(Number).sort((a, b) => a - b);
  const use = years.filter((y) => y <= year).pop() || years[0];
  return { year: use, stale: use !== year, ...RATES[use] };
}

export const GRADE_LABEL = { 1: "1등급", 2: "2등급", 3: "3등급", 4: "4등급", 5: "5등급", 6: "인지지원등급" };

// 기관이 신고한 비급여 내역에서 하루 식사재료비·상급침실료·월 이미용비를 뽑는다.
// 산정기준 문구 예: "1식 4000원 X 3식/일", "10000원 (일)", "회당 5000원 X 1회/월"
export function nonpaySummary(nonpay = []) {
  // 식사재료비 행에는 이름이 없고, 같은 기관이 일반식·죽·경관영양식을 각각 한 행씩 신고한다(금액이 같은 행이 반복됨).
  // 모두 더하면 부풀려지므로 "하루 3식" 행 중 가장 비싼 것 하나를 세 끼로, "하루 1~2식" 행 중 가장 비싼 것을 간식으로 본다.
  let main = 0;
  let snack = 0;
  let any = 0;
  const rooms = [];
  let beauty = 0;
  for (const x of nonpay) {
    const amt = Number(x.nonpayTgtAmt);
    if (!amt) continue;
    const base = String(x.prodBase || "");
    if (String(x.nonpayKind) === "1") {
      const m = base.match(/X\s*(\d+)\s*식\s*\/\s*일/);
      if (!m) continue;
      const times = Number(m[1]);
      const perDay = amt * times;
      if (times === 3) main = Math.max(main, perDay);
      else if (times < 3) snack = Math.max(snack, perDay);
      if (times <= 3) any = Math.max(any, perDay);
    } else if (String(x.nonpayKind) === "2") {
      if (/\(일\)/.test(base)) rooms.push(amt);
    } else if (String(x.nonpayKind) === "3") {
      const m = base.match(/X\s*(\d+)\s*회\s*\/\s*월/);
      if (m) beauty += amt * Number(m[1]);
    }
  }
  const meal = main ? main + snack : any; // 3식 행이 없으면(주야간보호 등) 가장 비싼 행 하나만
  return { meal: meal || null, roomMin: rooms.length ? Math.min(...rooms) : null, roomMax: rooms.length ? Math.max(...rooms) : null, beauty: beauty || null };
}

// 비급여 항목 코드 전체를 받아 중분류·소분류별로 보여 준다 (항목을 고를 때 쓰는 점검용)
import { get, parseXml } from "../src/care-fetch.js";
const BASE = "https://apis.data.go.kr/B551182/nonPaymentDamtInfoService/";
const all = [];
for (let pageNo = 1; pageNo <= 10; pageNo++) {
  const { items, total } = parseXml(await get(BASE + "getNonPaymentItemCodeList2", { pageNo, numOfRows: 500 }));
  all.push(...items);
  if (!items.length || all.length >= total) break;
}
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const live = all.filter((c) => !c.adtEndDd || c.adtEndDd >= today);
const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
if (filter) {
  for (const c of live.filter((c) => filter.test(c.npayKorNm))) console.log(c.npayCd, "|", c.npayKorNm, c.cmmtTxt ? "| " + c.cmmtTxt.slice(0, 80) : "");
} else {
  const by = {};
  for (const c of live) (by[c.npayMdivCdNm] ||= new Set()).add(c.npaySdivCdNm);
  console.log("전체", all.length, "적용 중", live.length);
  for (const [m, s] of Object.entries(by)) console.log(`${m} (${s.size}): ${[...s].slice(0, 14).join(", ")}${s.size > 14 ? " …" : ""}`);
}

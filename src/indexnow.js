// 배포가 끝난 뒤 새로 생긴 페이지 주소를 IndexNow 로 검색엔진에 알린다 (네이버·Bing 등 참여 엔진 전체에 공유됨).
// 실제 사이트의 robots.txt → 사이트맵 → 주소 목록을 읽어, 아직 보낸 적 없는 주소만 보낸다.
// 키 파일: static/<KEY>.txt (사이트 루트에 그대로 올라간다). 키는 공개 값이라 비밀이 아니다.
//   node src/indexnow.js            보내고 data/indexnow-sent.json 갱신
//   node src/indexnow.js --dry-run  보낼 개수만 출력
import path from "node:path";
import { CONFIG, ROOT, readJson, writeJson } from "./config.js";

const KEY = "cc8360db25351b87a127de1040a298de";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const SENT = path.join(ROOT, "data", "indexnow-sent.json");
const BATCH = 10000; // 규격상 한 번에 최대 1만 개

const text = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
};
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());

async function liveUrls(site) {
  const robots = await text(`${site}/robots.txt`);
  const maps = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const urls = new Set();
  for (const map of maps) for (const u of locs(await text(map))) if (u.startsWith(site + "/")) urls.add(u);
  return [...urls];
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const site = CONFIG.siteUrl;
  if (/example\.com/.test(site)) return console.log("[indexnow] SITE_URL/CUSTOM_DOMAIN 이 없어 건너뜀");
  const host = new URL(site).host;

  const key = await fetch(`${site}/${KEY}.txt`).then((r) => (r.ok ? r.text() : ""), () => "");
  if (key.trim() !== KEY) {
    if (!dry) return console.log("[indexnow] 키 파일이 아직 사이트에 없어 건너뜀 (다음 배포 뒤 다시 시도)");
    console.log("[indexnow] 키 파일이 아직 사이트에 없음 (dry-run 이라 계속)");
  }

  const sent = new Set(readJson(SENT, []));
  const fresh = (await liveUrls(site)).filter((u) => !sent.has(u.slice(site.length)));
  console.log(`[indexnow] 사이트 주소 중 새로 알릴 것 ${fresh.length}개 (이미 알린 것 ${sent.size}개)`);
  if (dry || !fresh.length) return;

  let ok = 0;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const urlList = fresh.slice(i, i + BATCH);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList }),
    });
    if (res.status !== 200 && res.status !== 202) {
      console.log(`[indexnow] 전송 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break; // 실패한 묶음부터는 다음 실행 때 다시 보낸다
    }
    for (const u of urlList) sent.add(u.slice(site.length));
    ok += urlList.length;
  }
  writeJson(SENT, [...sent].sort());
  console.log(`[indexnow] ${ok}개 전송 완료`);
}

main().catch((err) => {
  console.log(`[indexnow] 실패(배포에는 영향 없음): ${err.message}`);
});

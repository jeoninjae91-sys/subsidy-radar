// 부모님 알림 신청 집계: node stats.mjs  (이메일은 화면에 앞 두 글자만 보여 줌)
import { execSync } from "node:child_process";
const q = (sql) => JSON.parse(execSync(`npx -y wrangler@4 d1 execute linkstats --remote --json --command "${sql}"`, { encoding: "utf8" }))[0].results;
console.log("== 날짜별 (방문 · 혜택 찾기 · 알림창 열기 · 신청)");
const ev = q("SELECT day,k,n FROM parents_ev ORDER BY day");
const days = {};
for (const r of ev) (days[r.day] ||= {})[r.k] = r.n;
console.table(Object.entries(days).map(([d, v]) => ({ 날짜: d, 방문: v.view || 0, 찾기: v.search || 0, 알림창: v.signup_open || 0, 신청: v.signup_ok || 0 })));
const subs = q("SELECT email,birth_year,sido,sigungu,src,created_at FROM parents_subs ORDER BY created_at");
console.log(`== 신청자 ${subs.length}명`);
console.table(subs.map((s) => ({ 이메일: s.email.slice(0, 2) + "***", 출생연도: s.birth_year, 지역: `${s.sido} ${s.sigungu || ""}`.trim(), 유입: s.src || "", 신청일: s.created_at.slice(0, 10) })));

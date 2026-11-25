// 사이트 문의 보기: node messages.mjs   (지운 것까지 보려면 그대로, 하나 지우기: node messages.mjs del <id>)
import { execSync } from "node:child_process";
const run = (sql) => JSON.parse(execSync(`npx -y wrangler@4 d1 execute linkstats --remote --json --command "${sql}"`, { encoding: "utf8" }))[0].results;
if (process.argv[2] === "del" && /^\d+$/.test(process.argv[3] || "")) {
  run(`DELETE FROM radar_msgs WHERE id=${process.argv[3]}`);
  console.log("지웠어요:", process.argv[3]);
} else {
  const rows = run("SELECT id,created_at,kind,email,page,message FROM radar_msgs ORDER BY id DESC LIMIT 50");
  console.log(`== 문의 ${rows.length}건 (최근 50건)`);
  for (const r of rows) console.log(`\n#${r.id} [${r.kind}] ${r.created_at}${r.email ? " · 답장: " + r.email : ""}${r.page ? " · " + r.page : ""}\n${r.message}`);
}

// 부모님 혜택 알림 신청 저장 (Cloudflare Worker + D1 "linkstats" 안의 parents_ 표 — 무료 요금제 DB 10개 한도 때문)
//   POST /subscribe   {email, birthYear, sido, sigungu, consent, from}  → 신청 저장(같은 이메일이면 갱신)
//   GET  /unsubscribe?t=토큰                                            → 즉시 삭제
//   GET  /ev?k=키                                                       → 날짜·키별 횟수만 센다(개인 정보 없음)
// 이름·전화번호·IP는 저장하지 않는다.

const ALLOW = ["https://jiwongeumradar.com", "http://localhost:4173", "http://localhost:4189"];
const EVENTS = /^(view|search|signup_open|signup_ok)$/;

function cors(req) {
  const o = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOW.includes(o) ? o : ALLOW[0],
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}
const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(req) } });
const dayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function count(env, k) {
  await env.DB.prepare("INSERT INTO parents_ev(day,k,n) VALUES(?,?,1) ON CONFLICT(day,k) DO UPDATE SET n=n+1").bind(dayKST(), k).run();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

    if (url.pathname === "/ev") {
      const k = url.searchParams.get("k") || "";
      if (EVENTS.test(k)) await count(env, k);
      return new Response(null, { status: 204, headers: cors(req) });
    }

    if (url.pathname === "/subscribe" && req.method === "POST") {
      let b;
      try { b = await req.json(); } catch { return json(req, { ok: false, error: "형식이 올바르지 않아요." }, 400); }
      const email = String(b.email || "").trim().toLowerCase();
      const year = Number(b.birthYear);
      const thisYear = new Date().getFullYear();
      const sido = String(b.sido || "").slice(0, 20);
      const sigungu = String(b.sigungu || "").slice(0, 20);
      const from = String(b.from || "").slice(0, 30);
      if (b.consent !== true) return json(req, { ok: false, error: "개인정보 수집·이용에 동의해 주세요." }, 400);
      if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return json(req, { ok: false, error: "이메일 주소를 확인해 주세요." }, 400);
      if (!(year >= thisYear - 110 && year <= thisYear - 40)) return json(req, { ok: false, error: "부모님 출생연도를 확인해 주세요." }, 400);
      if (!sido) return json(req, { ok: false, error: "사시는 시·도를 골라 주세요." }, 400);
      const token = crypto.randomUUID().replace(/-/g, "");
      await env.DB.prepare(
        `INSERT INTO parents_subs(email,birth_year,sido,sigungu,src,token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(email,birth_year) DO UPDATE SET sido=excluded.sido, sigungu=excluded.sigungu, updated_at=excluded.updated_at`
      ).bind(email, year, sido, sigungu, from, token, new Date().toISOString(), new Date().toISOString()).run();
      await count(env, "signup_ok");
      return json(req, { ok: true });
    }

    // 사이트 문의 (contact.html) — 내용과, 답장을 원할 때만 이메일을 저장한다. 운영자 연락처는 노출하지 않는다.
    if (url.pathname === "/contact" && req.method === "POST") {
      let b;
      try { b = await req.json(); } catch { return json(req, { ok: false, error: "형식이 올바르지 않아요." }, 400); }
      if (b.website) return json(req, { ok: true }); // 로봇이 채우는 숨은 칸
      const kind = ["오류 제보", "제휴", "기타"].includes(b.kind) ? b.kind : "기타";
      const message = String(b.message || "").trim().slice(0, 2000);
      const email = String(b.email || "").trim().toLowerCase().slice(0, 254);
      const page = String(b.page || "").slice(0, 200);
      if (message.length < 5) return json(req, { ok: false, error: "내용을 5자 이상 적어 주세요." }, 400);
      if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return json(req, { ok: false, error: "답장 받을 이메일 주소를 확인해 주세요." }, 400);
      const today = (await env.DB.prepare("SELECT COUNT(*) n FROM radar_msgs WHERE created_at >= ?").bind(dayKST()).first()).n;
      if (today >= 100) return json(req, { ok: false, error: "오늘은 문의가 많아요. 내일 다시 보내 주세요." }, 429);
      await env.DB.prepare("INSERT INTO radar_msgs(created_at,kind,message,email,page) VALUES(?,?,?,?,?)")
        .bind(new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 16), kind, message, email || null, page).run();
      return json(req, { ok: true });
    }

    if (url.pathname === "/unsubscribe") {
      const t = url.searchParams.get("t") || "";
      let n = 0;
      if (/^[a-f0-9]{32}$/.test(t)) n = (await env.DB.prepare("DELETE FROM parents_subs WHERE token=?").bind(t).run()).meta.changes;
      const msg = n ? "알림 신청을 해지했어요. 저장된 정보도 모두 지웠습니다." : "이미 해지되었거나 주소가 올바르지 않아요.";
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>알림 해지</title><body style="font-family:sans-serif;max-width:560px;margin:60px auto;padding:0 16px;line-height:1.7"><h1 style="font-size:22px">${msg}</h1><p><a href="https://jiwongeumradar.com/">지원금 레이더로 돌아가기</a></p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("not found", { status: 404 });
  },
};

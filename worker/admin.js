import { queueToken } from "./core.js";
import { readTextLimited } from "./http.js";

const ADMIN_STORAGE_KEY = "gc2026.queue.admin.v1";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

export const hiddenAdminResponse = () =>
  new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

async function constantTimeEqual(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
  }
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function isAdminAuthorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = typeof env.ADMIN_TOKEN === "string" ? env.ADMIN_TOKEN : "";
  return provided.length > 0 && expected.length > 0 && await constantTimeEqual(provided, expected);
}

export function adminShellResponse() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Queue moderation</title>
<style>
:root{color-scheme:dark;font:16px/1.4 system-ui,sans-serif;background:#111;color:#f5f2e9}
*{box-sizing:border-box}body{margin:0 auto;max-width:48rem;padding:max(1rem,env(safe-area-inset-top)) 1rem max(2rem,env(safe-area-inset-bottom))}
h1,h2{line-height:1.05}section{border:2px solid #777;padding:1rem;margin:1rem 0;background:#1b1b1b}
label{display:block;margin:.65rem 0}.row{display:grid;grid-template-columns:1fr 1fr;gap:.65rem}
input,button{font:inherit;min-height:44px;width:100%;padding:.65rem;border:2px solid #999;background:#222;color:inherit}
button{background:#f16b2b;color:#111;font-weight:800;border-color:#f16b2b}button.secondary{background:#222;color:#fff}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto;background:#080808;padding:.75rem}
#status{min-height:1.5em}.danger{border-color:#e34b4b}@media(max-width:36rem){.row{grid-template-columns:1fr}}
</style>
</head>
<body>
<h1>Queue moderation</h1>
<section id="login">
  <label>Admin token <input id="token" type="password" autocomplete="current-password"></label>
  <button id="load">Save token &amp; load</button>
</section>
<p id="status" role="status" aria-live="polite"></p>
<section>
  <h2>Break glass</h2>
  <div class="row"><button data-simple="pause">Pause writes</button><button class="secondary" data-simple="resume">Resume writes</button></div>
</section>
<section>
  <h2>Client</h2>
  <label>Client UUID <input id="client" autocomplete="off"></label>
  <button class="danger" data-action="deny_client">Delete reports &amp; deny</button>
</section>
<section>
  <h2>Queue</h2>
  <label>Exhibitor id <input id="exhibitor" autocomplete="off"></label>
  <label>Game key or _booth <input id="game" autocomplete="off"></label>
  <label>Minutes to purge <input id="minutes" type="number" min="1" max="1440" value="60"></label>
  <div class="row">
    <button class="danger" data-action="purge_queue">Purge recent</button>
    <button data-action="force_closure">Force closed 60m</button>
    <button class="secondary" data-action="clear_closure">Force open 60m</button>
    <button class="secondary" data-action="auto_closure">Return to automatic</button>
  </div>
</section>
<section><h2>Current data</h2><button class="secondary" id="refresh">Refresh</button><pre id="data">Not loaded.</pre></section>
<script>
(() => {
  const key=${JSON.stringify(ADMIN_STORAGE_KEY)};
  const token=document.querySelector('#token');
  const status=document.querySelector('#status');
  const output=document.querySelector('#data');
  token.value=localStorage.getItem(key)||'';
  const headers=()=>({'Authorization':'Bearer '+token.value,'Content-Type':'application/json'});
  const say=(message)=>{status.textContent=message};
  async function request(url,options={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{return await fetch(url,{...options,signal:controller.signal})}
    finally{clearTimeout(timer)}
  }
  async function load(){
    localStorage.setItem(key,token.value);
    say('Loading…');
    try{
      const response=await request('/api/admin/data',{headers:headers(),cache:'no-store'});
      if(!response.ok){say('Could not authenticate.');return}
      output.textContent=JSON.stringify(await response.json(),null,2);say('Loaded.');
    }catch{say('Network unavailable. Retry when connected.')}
  }
  async function act(action,extra={}){
    say('Applying…');
    const body={action,...extra};
    if(action==='deny_client') body.client=document.querySelector('#client').value.trim();
    if(['purge_queue','force_closure','clear_closure','auto_closure'].includes(action)){
      body.exhibitor=document.querySelector('#exhibitor').value.trim();
      body.game=document.querySelector('#game').value.trim();
    }
    if(action==='purge_queue') body.minutes=Number(document.querySelector('#minutes').value);
    try{
      const response=await request('/api/admin/action',{method:'POST',headers:headers(),body:JSON.stringify(body)});
      if(!response.ok){say(response.status===404?'Could not authenticate.':'Action failed.');return}
      say('Applied.');await load();
    }catch{say('Network unavailable. Action outcome unknown; refresh before retrying.')}
  }
  document.querySelector('#load').addEventListener('click',load);
  document.querySelector('#refresh').addEventListener('click',load);
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>act(button.dataset.action)));
  document.querySelector('[data-simple="pause"]').addEventListener('click',()=>act('pause_writes',{paused:true}));
  document.querySelector('[data-simple="resume"]').addEventListener('click',()=>act('pause_writes',{paused:false}));
  if(token.value) load();
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, noarchive",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

function queueDiagnostics(live, reportRows, sessionRows) {
  const rows = new Map();
  const ensure = (exhibitor, game) => {
    const key = queueToken(exhibitor, game);
    if (!rows.has(key)) rows.set(key, { exhibitor, game, answer: null });
    return rows.get(key);
  };
  for (const [exhibitor, games] of Object.entries(live || {})) {
    for (const [game, answer] of Object.entries(games || {})) ensure(exhibitor, game).answer = answer;
  }
  for (const row of reportRows || []) ensure(row.exhibitor, row.game).recentReports = row;
  for (const row of sessionRows || []) ensure(row.exhibitor, row.game).recentSessions = row;
  return [...rows.values()]
    .sort((a, b) => {
      const newestA = Number(a.answer?.newest || a.recentReports?.newest || a.recentSessions?.newest || 0);
      const newestB = Number(b.answer?.newest || b.recentReports?.newest || b.recentSessions?.newest || 0);
      return newestB - newestA || a.exhibitor.localeCompare(b.exhibitor) || a.game.localeCompare(b.game);
    })
    .slice(0, 200);
}

export async function handleAdminData(env, now, live) {
  const since = now - 24 * 60 * 60;
  const results = await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, CAST(at / 3600 AS INTEGER) * 3600 AS hour, COUNT(*) AS reports
       FROM report_events WHERE at >= ? GROUP BY exhibitor, game, hour
       ORDER BY hour DESC, reports DESC LIMIT 500`
    ).bind(since),
    env.QUEUE_DB.prepare(
      `SELECT client, COUNT(*) AS reports, COUNT(DISTINCT exhibitor || char(0) || game) AS queues,
              MAX(at) AS newest
       FROM report_events WHERE at >= ? GROUP BY client ORDER BY reports DESC LIMIT 50`
    ).bind(since),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, COUNT(*) AS reports, COUNT(DISTINCT client) AS clients, MAX(at) AS newest
       FROM report_events WHERE at >= ? GROUP BY exhibitor, game ORDER BY reports DESC LIMIT 100`
    ).bind(since),
    env.QUEUE_DB.prepare(
      `SELECT id, action, detail, at FROM admin_log ORDER BY at DESC, id DESC LIMIT 100`
    ),
    env.QUEUE_DB.prepare(`SELECT key, value, updated_at FROM settings ORDER BY key`),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, forced_closed, expires_at, updated_at
       FROM queue_overrides WHERE expires_at > ? ORDER BY updated_at DESC`
    ).bind(now),
    env.QUEUE_DB.prepare(
      `SELECT client, exhibitor, game, COUNT(*) AS reports,
              COUNT(DISTINCT ahead) AS ahead_values, MIN(ahead) AS min_ahead,
              MAX(ahead) AS max_ahead, MAX(at) AS newest
       FROM report_events
       WHERE at >= ? AND kind IN ('joined', 'update') AND ahead IS NOT NULL
       GROUP BY client, exhibitor, game
       HAVING COUNT(DISTINCT ahead) >= 3
       ORDER BY ahead_values DESC, reports DESC, newest DESC LIMIT 50`
    ).bind(since),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game,
              SUM(CASE WHEN kind = 'joined' AND at >= ? THEN 1 ELSE 0 END) AS joins_15m,
              SUM(CASE WHEN kind = 'update' AND at >= ? THEN 1 ELSE 0 END) AS updates_45m,
              SUM(CASE WHEN kind = 'entered' THEN 1 ELSE 0 END) AS entered_60m,
              SUM(CASE WHEN kind = 'closed' THEN 1 ELSE 0 END) AS closed_60m,
              COUNT(DISTINCT client) AS clients_60m,
              MIN(CASE WHEN ahead IS NOT NULL THEN ahead END) AS min_ahead,
              MAX(CASE WHEN ahead IS NOT NULL THEN ahead END) AS max_ahead,
              MAX(at) AS newest
       FROM report_events WHERE at >= ? GROUP BY exhibitor, game
       ORDER BY newest DESC LIMIT 150`
    ).bind(now - 15 * 60, now - 45 * 60, now - 60 * 60),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game,
              SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END) AS open_sessions,
              MIN(CASE WHEN outcome IS NULL THEN CAST((? - joined_at) / 60 AS INTEGER) END) AS min_open_minutes,
              MAX(CASE WHEN outcome IS NULL THEN CAST((? - joined_at) / 60 AS INTEGER) END) AS max_open_minutes,
              SUM(CASE WHEN outcome = 'entered' THEN 1 ELSE 0 END) AS entered_sessions,
              MIN(CASE WHEN outcome = 'entered' THEN CAST((closed_at - joined_at) / 60 AS INTEGER) END) AS min_wait_minutes,
              MAX(CASE WHEN outcome = 'entered' THEN CAST((closed_at - joined_at) / 60 AS INTEGER) END) AS max_wait_minutes,
              MAX(COALESCE(closed_at, updated_at)) AS newest
       FROM sessions
       WHERE (outcome IS NULL AND updated_at >= ?)
          OR (outcome = 'entered' AND closed_at >= ?)
       GROUP BY exhibitor, game ORDER BY newest DESC LIMIT 150`
    ).bind(now, now, now - 4 * 60 * 60, now - 60 * 60),
    env.QUEUE_DB.prepare(
      `WITH recent_closures AS (
         SELECT exhibitor, game, COUNT(DISTINCT client) AS closure_clients,
                MAX(reported_at) AS newest_closure
         FROM closure_reports WHERE reported_at >= ? GROUP BY exhibitor, game
       ), other_counters AS (
         SELECT e.exhibitor, e.game, COUNT(DISTINCT e.client) AS counter_clients,
                MAX(e.at) AS newest_counter
         FROM report_events e
         WHERE e.at >= ? AND e.kind IN ('joined', 'update', 'entered')
           AND NOT EXISTS (
             SELECT 1 FROM closure_reports c
             WHERE c.exhibitor = e.exhibitor AND c.game = e.game
               AND c.client = e.client AND c.reported_at >= ?
           )
         GROUP BY e.exhibitor, e.game
       )
       SELECT c.exhibitor, c.game, c.closure_clients, o.counter_clients,
              c.newest_closure, o.newest_counter
       FROM recent_closures c JOIN other_counters o
         ON o.exhibitor = c.exhibitor AND o.game = c.game
       WHERE o.counter_clients >= 2 AND o.newest_counter > c.newest_closure
       ORDER BY o.newest_counter DESC LIMIT 50`
    ).bind(now - 60 * 60, now - 60 * 60, now - 60 * 60),
    env.QUEUE_DB.prepare(
      `SELECT client, COUNT(DISTINCT exhibitor || char(0) || game) AS queues,
              COUNT(*) AS reports, MAX(at) AS newest
       FROM report_events WHERE at >= ? GROUP BY client HAVING queues >= 3
       ORDER BY queues DESC, reports DESC, newest DESC LIMIT 50`
    ).bind(now - 15 * 60),
  ]);
  return json({
    at: now,
    writesPaused: results[4].results.some((row) => row.key === "writes_paused" && row.value === "1"),
    live,
    hourly: results[0].results,
    topClients: results[1].results,
    queueVolume: results[2].results,
    queueDiagnostics: queueDiagnostics(live, results[7].results, results[8].results),
    manyQueueClients: results[10].results,
    aheadAnomalies: results[6].results,
    closureContradictions: results[9].results,
    overrides: results[5].results,
    adminLog: results[3].results,
  });
}

async function readAction(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return null;
  const text = await readTextLimited(request, 4096);
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const logStatement = (db, action, detail, now) =>
  db.prepare(`INSERT INTO admin_log (action, detail, at) VALUES (?, ?, ?)`).bind(
    action,
    JSON.stringify(detail),
    now
  );

function validQueue(body, queues) {
  return (
    typeof body.exhibitor === "string" &&
    typeof body.game === "string" &&
    queues.has(queueToken(body.exhibitor, body.game))
  );
}

export async function handleAdminAction(request, env, now, queues) {
  const body = await readAction(request);
  if (!body || typeof body.action !== "string") return json({ error: "invalid_request" }, 400);

  if (body.action === "deny_client") {
    if (typeof body.client !== "string" || !UUID_V4.test(body.client)) {
      return json({ error: "invalid_client" }, 400);
    }
    await env.QUEUE_DB.batch([
      env.QUEUE_DB.prepare(
        `INSERT INTO denylist (client, added_at) VALUES (?, ?)
         ON CONFLICT(client) DO UPDATE SET added_at = excluded.added_at`
      ).bind(body.client, now),
      env.QUEUE_DB.prepare(`DELETE FROM sessions WHERE client = ?`).bind(body.client),
      env.QUEUE_DB.prepare(`DELETE FROM queue_meta WHERE client = ?`).bind(body.client),
      env.QUEUE_DB.prepare(`DELETE FROM closure_reports WHERE client = ?`).bind(body.client),
      env.QUEUE_DB.prepare(`DELETE FROM report_events WHERE client = ?`).bind(body.client),
      logStatement(env.QUEUE_DB, body.action, { client: body.client }, now),
    ]);
    return json({ ok: true });
  }

  if (body.action === "pause_writes") {
    if (typeof body.paused !== "boolean") return json({ error: "invalid_request" }, 400);
    await env.QUEUE_DB.batch([
      env.QUEUE_DB.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('writes_paused', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(body.paused ? "1" : "0", now),
      logStatement(env.QUEUE_DB, body.action, { paused: body.paused }, now),
    ]);
    return json({ ok: true, paused: body.paused });
  }

  if (!["purge_queue", "force_closure", "clear_closure", "auto_closure"].includes(body.action)) {
    return json({ error: "unknown_action" }, 400);
  }
  if (!validQueue(body, queues)) return json({ error: "unknown_queue" }, 404);

  const queue = [body.exhibitor, body.game];
  if (body.action === "purge_queue") {
    if (!Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 1440) {
      return json({ error: "invalid_minutes" }, 400);
    }
    const cutoff = now - body.minutes * 60;
    await env.QUEUE_DB.batch([
      env.QUEUE_DB.prepare(
        `DELETE FROM sessions
         WHERE exhibitor = ? AND game = ? AND (created_at >= ? OR updated_at >= ?)`
      ).bind(...queue, cutoff, cutoff),
      env.QUEUE_DB.prepare(
        `DELETE FROM queue_meta WHERE exhibitor = ? AND game = ? AND reported_at >= ?`
      ).bind(...queue, cutoff),
      env.QUEUE_DB.prepare(
        `DELETE FROM closure_reports WHERE exhibitor = ? AND game = ? AND reported_at >= ?`
      ).bind(...queue, cutoff),
      env.QUEUE_DB.prepare(
        `DELETE FROM report_events WHERE exhibitor = ? AND game = ? AND at >= ?`
      ).bind(...queue, cutoff),
      logStatement(env.QUEUE_DB, body.action, { exhibitor: queue[0], game: queue[1], minutes: body.minutes }, now),
    ]);
    return json({ ok: true });
  }

  if (body.action === "auto_closure") {
    await env.QUEUE_DB.batch([
      env.QUEUE_DB.prepare(`DELETE FROM queue_overrides WHERE exhibitor = ? AND game = ?`).bind(...queue),
      logStatement(env.QUEUE_DB, body.action, { exhibitor: queue[0], game: queue[1] }, now),
    ]);
    return json({ ok: true });
  }

  const forcedClosed = body.action === "force_closure" ? 1 : 0;
  const statements = [
    env.QUEUE_DB.prepare(
      `INSERT INTO queue_overrides (exhibitor, game, forced_closed, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(exhibitor, game) DO UPDATE SET forced_closed = excluded.forced_closed,
         expires_at = excluded.expires_at, updated_at = excluded.updated_at`
    ).bind(...queue, forcedClosed, now + 60 * 60, now),
  ];
  if (body.action === "clear_closure") {
    statements.push(
      env.QUEUE_DB.prepare(`DELETE FROM closure_reports WHERE exhibitor = ? AND game = ?`).bind(...queue)
    );
  }
  statements.push(
    logStatement(
      env.QUEUE_DB,
      body.action,
      { exhibitor: queue[0], game: queue[1], expiresAt: now + 60 * 60 },
      now
    )
  );
  await env.QUEUE_DB.batch(statements);
  return json({ ok: true, forcedClosed: Boolean(forcedClosed), expiresAt: now + 60 * 60 });
}

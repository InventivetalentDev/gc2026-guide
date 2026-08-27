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
.lede{color:#c9c4ba;margin:.4rem 0 1.2rem}
.hint{color:#a29c92;font-size:.86rem;line-height:1.45;margin:.5rem 0 0}
ul.hint{padding-left:1.1rem}ul.hint li{margin:.3rem 0}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85em;background:#000;padding:.1em .35em;border:1px solid #333}
.pick-label{color:#a29c92;font-size:.86rem;margin:.9rem 0 .4rem}
/* The two ids this page asks for are not things anyone carries in their head,
   so the values already in the data are offered as targets. Wide, wrapping and
   44px tall because this gets used one-handed in a crowded hall. */
.picks{display:flex;flex-wrap:wrap;gap:.4rem;color:#a29c92;font-size:.86rem}
button.pick{width:auto;min-height:44px;background:#222;color:#f5f2e9;border-color:#555;font-size:.82rem;
  font-weight:600;padding:.4rem .7rem;text-align:left}
button.pick:hover{border-color:#f16b2b}
.summary{margin:.8rem 0;padding:.6rem .7rem;background:#000;border-left:3px solid #4c8c4a;font-size:.86rem;
  overflow-wrap:anywhere}
.summary.alarm{border-left-color:#e34b4b;color:#ffd7d0}
details summary{cursor:pointer;padding:.5rem 0;font-weight:700}
</style>
</head>
<body>
<h1>Queue moderation</h1>
<p class="lede">Live queue reports, and the controls for when they go wrong. Every
action here is logged. Nothing on this page is translated or cached &mdash; it is
operator-facing and always fetched fresh.</p>

<section id="login">
  <label>Admin token <input id="token" type="password" autocomplete="current-password"></label>
  <button id="load">Save token &amp; load</button>
  <p class="hint">Stored on this device only. Set with
  <code>wrangler secret put ADMIN_TOKEN</code>.</p>
</section>
<p id="status" role="status" aria-live="polite"></p>

<section>
  <h2>Break glass</h2>
  <p class="hint">Pause stops every new report, show-wide, until you resume. Reading
  the live figures keeps working; the numbers just stop moving. Use it to stop a
  flood while you work out what to do about it.</p>
  <div class="row"><button data-simple="pause">Pause writes</button><button class="secondary" data-simple="resume">Resume writes</button></div>
</section>

<section>
  <h2>Client</h2>
  <p class="hint">A client is one device. The id is random and resettable, so this
  is a speed bump, not a ban.</p>
  <p class="pick-label">Busiest devices, last 24h &mdash; tap to fill:</p>
  <div id="pick-clients" class="picks">Load the data to list these.</div>
  <label>Client UUID <input id="client" autocomplete="off" spellcheck="false" list="client-list"></label>
  <datalist id="client-list"></datalist>
  <p class="hint">Also the <code>client</code> field on any row of the raw data
  below &mdash; the anomaly lists are the usual place to find a bad one.</p>
  <button class="danger" data-action="deny_client">Delete reports &amp; deny</button>
  <p class="hint">Deletes every report this device has ever sent and refuses its
  future ones. Not reversible.</p>
</section>

<section>
  <h2>Queue</h2>
  <p class="pick-label">Queues reported in the last 24h &mdash; tap to fill:</p>
  <div id="pick-queues" class="picks">Load the data to list these.</div>
  <label>Exhibitor id <input id="exhibitor" autocomplete="off" spellcheck="false" list="exhibitor-list"></label>
  <datalist id="exhibitor-list"></datalist>
  <p class="hint">The id in the guide's own link to a booth's queues:
  <code>hallgui.de/#queues?ex=<b>xbox</b></code>. Same value as <code>id</code> in
  <code>data/exhibitors.json</code>.</p>
  <label>Game key or _booth <input id="game" autocomplete="off" spellcheck="false" list="game-list"></label>
  <datalist id="game-list"></datalist>
  <p class="hint">The game's title lowercased with runs of spaces collapsed &mdash;
  &ldquo;Forza Horizon 6&rdquo; is <code>forza horizon 6</code>. Exhibitors with no
  playable lineup have one queue keyed <code>_booth</code> instead.</p>
  <label>Minutes to purge <input id="minutes" type="number" min="1" max="1440" value="60"></label>
  <div class="row">
    <button class="danger" data-action="purge_queue">Purge recent</button>
    <button data-action="force_closure">Force closed 60m</button>
    <button class="secondary" data-action="clear_closure">Force open 60m</button>
    <button class="secondary" data-action="auto_closure">Return to automatic</button>
  </div>
  <ul class="hint">
    <li><b>Purge recent</b> deletes this queue's sessions, closure votes, mechanics
    and events from the last N minutes. Not reversible.</li>
    <li><b>Force closed</b> shows &ldquo;Queue closed&rdquo; whatever the crowd says.</li>
    <li><b>Force open</b> suppresses that and clears the closure votes behind it.</li>
    <li><b>Return to automatic</b> drops the override and lets the two-device rule
    decide again. The forced states expire on their own after an hour.</li>
  </ul>
</section>

<section>
  <h2>Current data</h2>
  <button class="secondary" id="refresh">Refresh</button>
  <div id="summary" class="summary">Not loaded.</div>
  <details><summary>Everything, as JSON</summary><pre id="data">Not loaded.</pre></details>
  <p class="hint"><b>queueDiagnostics</b> pairs each queue's published answer with the
  inputs behind it. <b>closureClaims</b> lists recent &ldquo;queue closed&rdquo;
  reports with the arrivals rebutting them and whether the rule closes it
  (<code>would_close</code>). <b>aheadAnomalies</b> and <b>manyQueueClients</b> are
  the cheap tells for one device making things up. <b>statsHourly</b> is the
  anonymous per-queue, per-hour aggregate the rollup keeps past the 24-hour
  sweep &mdash; the show-long metrics, and what feeds the &ldquo;yesterday&rdquo;
  estimates.</p>
</section>
<script>
(() => {
  var key=${JSON.stringify(ADMIN_STORAGE_KEY)};
  var token=document.querySelector('#token');
  var status=document.querySelector('#status');
  var output=document.querySelector('#data');
  var summary=document.querySelector('#summary');
  token.value=localStorage.getItem(key)||'';
  var headers=function(){return {'Authorization':'Bearer '+token.value,'Content-Type':'application/json'}};
  var say=function(message){status.textContent=message};

  async function request(url,options){
    options=options||{};
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort()},10000);
    try{return await fetch(url,Object.assign({},options,{signal:controller.signal}))}
    finally{clearTimeout(timer)}
  }

  function fillOptions(id,values){
    var list=document.querySelector(id);
    list.innerHTML='';
    values.forEach(function(value){
      var option=document.createElement('option');
      option.value=value;
      list.appendChild(option);
    });
  }

  /* The point of these: the two ids this page asks for are not things anybody
     carries in their head, and the data already names every one in use. */
  function renderPicks(node,rows,label,onPick,empty){
    node.innerHTML='';
    if(!rows.length){node.textContent=empty;return}
    rows.forEach(function(row){
      var button=document.createElement('button');
      button.type='button';
      button.className='pick';
      button.textContent=label(row);
      button.addEventListener('click',function(){onPick(row)});
      node.appendChild(button);
    });
  }

  function renderSummary(data){
    var queues=(data.queueVolume||[]).length;
    var clients=(data.topClients||[]).length;
    var overrides=(data.overrides||[]).length;
    var closing=(data.closureClaims||[]).filter(function(c){return c.would_close===1}).length;
    var when=new Date((data.at||0)*1000).toLocaleTimeString();
    var bits=[
      (data.writesPaused?'WRITES PAUSED':'writes on'),
      queues+' queues reported (24h)',
      clients+' devices',
      overrides+' override'+(overrides===1?'':'s')+' active',
      closing+' closed by crowd',
      'as of '+when
    ];
    summary.textContent=bits.join('  \u00b7  ');
    summary.className='summary'+(data.writesPaused?' alarm':'');
  }

  function renderAll(data){
    renderSummary(data);
    output.textContent=JSON.stringify(data,null,2);
    renderPicks(
      document.querySelector('#pick-queues'),
      (data.queueVolume||[]).slice(0,15),
      function(row){return row.exhibitor+' / '+row.game+'  ('+row.reports+')'},
      function(row){
        document.querySelector('#exhibitor').value=row.exhibitor;
        document.querySelector('#game').value=row.game;
        say('Filled '+row.exhibitor+' / '+row.game+'.');
      },
      'No queue has been reported in the last 24 hours. Type the ids by hand.'
    );
    renderPicks(
      document.querySelector('#pick-clients'),
      (data.topClients||[]).slice(0,10),
      function(row){return row.client.slice(0,8)+'\u2026  ('+row.reports+' in '+row.queues+')'},
      function(row){
        document.querySelector('#client').value=row.client;
        say('Filled '+row.client+'.');
      },
      'No device has reported in the last 24 hours.'
    );
    fillOptions('#exhibitor-list',[...new Set((data.queueVolume||[]).map(function(r){return r.exhibitor}))]);
    fillOptions('#game-list',[...new Set((data.queueVolume||[]).map(function(r){return r.game}))]);
    fillOptions('#client-list',(data.topClients||[]).map(function(r){return r.client}));
  }

  async function load(){
    localStorage.setItem(key,token.value);
    say('Loading\u2026');
    try{
      var response=await request('/api/admin/data',{headers:headers(),cache:'no-store'});
      if(!response.ok){say('Could not authenticate.');return}
      renderAll(await response.json());
      say('Loaded.');
    }catch(e){say('Network unavailable. Retry when connected.')}
  }

  async function act(action,extra){
    say('Applying\u2026');
    var body=Object.assign({action:action},extra||{});
    if(action==='deny_client') body.client=document.querySelector('#client').value.trim();
    if(['purge_queue','force_closure','clear_closure','auto_closure'].indexOf(action)!==-1){
      body.exhibitor=document.querySelector('#exhibitor').value.trim();
      body.game=document.querySelector('#game').value.trim();
      if(!body.exhibitor||!body.game){
        say('Pick a queue first, or type both ids.');
        return;
      }
    }
    if(action==='purge_queue') body.minutes=Number(document.querySelector('#minutes').value);
    try{
      var response=await request('/api/admin/action',{method:'POST',headers:headers(),body:JSON.stringify(body)});
      if(!response.ok){
        var reason=await response.json().catch(function(){return {}});
        say(response.status===404
          ? (reason.error==='unknown_queue'?'No such queue \u2014 check the two ids.':'Could not authenticate.')
          : 'Action failed'+(reason.error?' ('+reason.error+').':'.'));
        return;
      }
      say('Applied.');await load();
    }catch(e){say('Network unavailable. Action outcome unknown; refresh before retrying.')}
  }

  document.querySelector('#load').addEventListener('click',load);
  document.querySelector('#refresh').addEventListener('click',load);
  document.querySelectorAll('[data-action]').forEach(function(button){
    button.addEventListener('click',function(){act(button.dataset.action)});
  });
  document.querySelector('[data-simple="pause"]').addEventListener('click',function(){act('pause_writes',{paused:true})});
  document.querySelector('[data-simple="resume"]').addEventListener('click',function(){act('pause_writes',{paused:false})});
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
      /* Mirrors the estimator's closure rule exactly (worker/core.js), so this
         page never disagrees with the chip a visitor is looking at. Every recent
         claim is listed with the rebutting joins counted the same way the rule
         counts them — new arrivals only, after the newest claim, excluding the
         claimants — and `would_close` states the verdict the rule reaches. A
         claim showing would_close = 1 with a single rebuttal is the one worth a
         moderator's eye: one more join and it flips on its own. */
      `WITH recent_closures AS (
         SELECT exhibitor, game, COUNT(DISTINCT client) AS closure_clients,
                MAX(reported_at) AS newest_closure
         FROM closure_reports WHERE reported_at >= ? GROUP BY exhibitor, game
       ), rebuttals AS (
         SELECT c.exhibitor, c.game, COUNT(DISTINCT e.client) AS rebuttal_clients,
                MAX(e.at) AS newest_rebuttal
         FROM recent_closures c JOIN report_events e
           ON e.exhibitor = c.exhibitor AND e.game = c.game
          AND e.kind = 'joined' AND e.at > c.newest_closure
          AND NOT EXISTS (
            SELECT 1 FROM closure_reports x
            WHERE x.exhibitor = e.exhibitor AND x.game = e.game
              AND x.client = e.client AND x.reported_at >= ?
          )
         GROUP BY c.exhibitor, c.game
       )
       SELECT c.exhibitor, c.game, c.closure_clients, c.newest_closure,
              COALESCE(r.rebuttal_clients, 0) AS rebuttal_clients,
              r.newest_rebuttal,
              CASE WHEN c.closure_clients >= 2 AND COALESCE(r.rebuttal_clients, 0) < 2
                   THEN 1 ELSE 0 END AS would_close
       FROM recent_closures c
       LEFT JOIN rebuttals r ON r.exhibitor = c.exhibitor AND r.game = c.game
       ORDER BY would_close DESC, c.newest_closure DESC LIMIT 50`
    ).bind(now - 60 * 60, now - 60 * 60),
    env.QUEUE_DB.prepare(
      `SELECT client, COUNT(DISTINCT exhibitor || char(0) || game) AS queues,
              COUNT(*) AS reports, MAX(at) AS newest
       FROM report_events WHERE at >= ? GROUP BY client HAVING queues >= 3
       ORDER BY queues DESC, reports DESC, newest DESC LIMIT 50`
    ).bind(now - 15 * 60),
    /* The show-long aggregate the hourly rollup keeps past the 24-hour sweep:
       per queue and hour, counts and medians, no client ids. Newest first so
       the current day reads at the top of the JSON view. */
    env.QUEUE_DB.prepare(
      `SELECT hour, exhibitor, game, joined_n, update_n, entered_n, left_n, closed_n,
              clients_n, ahead_n, ahead_med, wait_n, wait_med
       FROM queue_stats_hourly
       ORDER BY hour DESC, entered_n DESC, joined_n DESC LIMIT 400`
    ),
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
    /* Every recent closure claim with the rule's verdict, not only the
       contradicted ones — a claim that is about to close a busy queue is as
       worth seeing as one already rebutted. */
    closureClaims: results[9].results,
    overrides: results[5].results,
    adminLog: results[3].results,
    statsHourly: results[11].results,
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

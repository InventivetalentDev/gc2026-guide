/* Cloudflare Turnstile verification for the queue write endpoint.
 *
 * The guide's premise is a hall with no usable mobile reception, and Turnstile
 * puts a second network dependency in front of every report: the widget script
 * has to load from challenges.cloudflare.com, and the token has to be minted
 * before the report can be sent. So enforcement is deliberately conditional on
 * two things rather than compiled in:
 *
 *   1. A secret must be bound. Without TURNSTILE_SECRET nothing can be
 *      verified, and a deploy that predates provisioning must not take live
 *      reporting down with it — so an unconfigured Worker accepts reports and
 *      says so loudly on the moderation page, rather than silently rejecting
 *      every visitor.
 *   2. The `turnstile_required` setting must not be "0". That is the kill
 *      switch, flipped from the phone-first console in seconds: if show-day
 *      reality turns out to be honest visitors failing the challenge on hall
 *      Wi-Fi, enforcement comes off without a deploy, and the reports keep
 *      flowing while it is investigated.
 *
 * Tokens are single-use and expire after 300 seconds, so the client mints one
 * per submission (see js/queue.js, which keeps one warm in advance so the
 * report itself is still a single round-trip).
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

export const turnstileConfigured = (env) =>
  typeof env.TURNSTILE_SECRET === "string" && env.TURNSTILE_SECRET.length > 0;

/**
 * @returns {Promise<{ok: true} | {ok: false, codes: string[]}>}
 */
export async function verifyTurnstile(env, token, ip) {
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  /* Cloudflare treats remoteip as optional and cross-checks it when present.
     Venue Wi-Fi and carrier NAT put many visitors behind one address, which is
     fine here: it is a signal to Cloudflare, not a limit we impose. */
  if (ip) body.append("remoteip", ip);

  /* A verification that hangs must not hold a report open. The site's own
     service worker gives up on the network after four seconds for the same
     reason; five here keeps the write path bounded either way. */
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(VERIFY_URL, { method: "POST", body, signal: abort.signal });
    if (!response.ok) return { ok: false, codes: [`http-${response.status}`] };
    const result = await response.json();
    return result.success
      ? { ok: true }
      : { ok: false, codes: Array.isArray(result["error-codes"]) ? result["error-codes"] : [] };
  } catch (error) {
    return { ok: false, codes: [error?.name === "AbortError" ? "timeout" : "unreachable"] };
  } finally {
    clearTimeout(timer);
  }
}

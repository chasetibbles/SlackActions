export default {
  async fetch(request, env, ctx) {
    // Slack only sends POSTs for slash commands
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Read raw body ONCE (needed for signature verification)
    const raw = await request.text();

    // ---- 1) Verify request is from Slack (signing secret) ----
    const ts = request.headers.get("X-Slack-Request-Timestamp");
    const slackSig = request.headers.get("X-Slack-Signature");

    if (!ts || !slackSig) {
      return new Response("Missing Slack signature headers", { status: 401 });
    }

    // Prevent replay attacks: reject if timestamp too old/new (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 60 * 5) {
      return new Response("Stale request", { status: 401 });
    }

    // Slack signature base string
    const baseString = `v0:${ts}:${raw}`;

    // Compute expected signature
    const expected = `v0=${await hmacSha256Hex(env.SLACK_SIGNING_SECRET, baseString)}`;

    if (!timingSafeEqual(slackSig, expected)) {
      return new Response("Invalid signature", { status: 401 });
    }

    // ---- 2) Parse slash command payload (x-www-form-urlencoded) ----
    const params = new URLSearchParams(raw);

    const payload = {
      command: params.get("command"),
      text: params.get("text"),
      user_id: params.get("user_id"),
      user_name: params.get("user_name"),
      team_id: params.get("team_id"),
      channel_id: params.get("channel_id"),
      response_url: params.get("response_url"),
      trigger_id: params.get("trigger_id"),
      received_at: new Date().toISOString(),
    };

    // ---- 3) Fire-and-forget to Router Worker (do NOT block Slack ACK) ----
    ctx.waitUntil(
      (async () => {
        try {
          const res = await fetch(env.ROUTER_WORKER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Protect Router Worker from random internet calls
              "X-Internal-Secret": env.INTERNAL_SECRET,
              // Optional trace/debug context
              "X-Source": "slack-ack-worker",
            },
            body: JSON.stringify(payload),
          });

          console.log("router status:", res.status);
          const t = await res.text().catch(() => "");
          console.log("router body:", t.slice(0, 300));
        } catch (e) {
          console.log("router error:", String(e));
        }
      })()
    );

    // ---- 4) Immediate Slack response ----
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Got it. Working on that…",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  },
};

// ----------------- helpers -----------------

async function hmacSha256Hex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time compare
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}


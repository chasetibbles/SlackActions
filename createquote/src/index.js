export default {
  async fetch(request, env, ctx) {
    // Slack only sends POSTs
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Slack sends application/x-www-form-urlencoded
    const raw = await request.text();
    const params = new URLSearchParams(raw);

    const payload = {
      command: params.get("command"),
      text: params.get("text"),
      user_id: params.get("user_id"),
      user_name: params.get("user_name"),
      team_id: params.get("team_id"),
      channel_id: params.get("channel_id"),
      response_url: params.get("response_url"),
      received_at: new Date().toISOString()
    };

    // Fire-and-forget to n8n
ctx.waitUntil((async () => {
  const res = await fetch(env.N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log("n8n status:", res.status);
  const t = await res.text().catch(() => "");
  console.log("n8n body:", t.slice(0, 300));
})());

    // Immediate Slack response
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Creating quote..."
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
};

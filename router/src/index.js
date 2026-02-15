export default {
  async fetch(request, env, ctx) {

    // Only allow POST
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify internal secret
    const internalSecret = request.headers.get("X-Internal-Secret");

    if (!internalSecret || internalSecret !== env.INTERNAL_SECRET) {
      console.log("Unauthorized request attempt");
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse JSON payload from ACK worker
    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      console.log("Invalid JSON payload");
      return new Response("Bad Request", { status: 400 });
    }

    // Log useful debugging info
    console.log("Router Worker received payload:");
    console.log(JSON.stringify(payload, null, 2));

    // Extract useful fields
    const {
      command,
      text,
      user_id,
      user_name,
      team_id,
      channel_id,
      response_url,
      received_at
    } = payload;

    // Build confirmation message
    const confirmationText =
      `Router Worker received command successfully.\n\n` +
      `Command: ${command}\n` +
      `Text: ${text}\n` +
      `User: ${user_name} (${user_id})\n` +
      `Team: ${team_id}\n` +
      `Channel: ${channel_id}\n` +
      `Received at: ${received_at}`;

    // Optional: respond back to Slack asynchronously using response_url
    // This proves the full async chain works
    if (response_url) {
      ctx.waitUntil(
        fetch(response_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            response_type: "ephemeral",
            text: confirmationText
          })
        })
      );
    }

    // Respond to ACK worker
    return new Response(
      JSON.stringify({
        status: "ok",
        message: "Router Worker processed request successfully"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};



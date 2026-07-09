import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    const email = record?.email ?? "unknown email";
    const createdAt = record?.created_at ?? new Date().toISOString();

    const message =
      `🎉 New Natrix signup!\n\n` +
      `📧 ${email}\n` +
      `🕐 ${new Date(createdAt).toLocaleString("en-SG", {
        timeZone: "Asia/Singapore",
      })}`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const res = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Telegram send failed:", errText);
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 500,
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("notify-signup error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
    });
  }
});
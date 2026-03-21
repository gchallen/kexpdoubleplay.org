import type { DoublePlay } from "@kexp-doubleplay/types";
import type { Env } from "./types";

export async function sendDoublePlayNotification(
  env: Env,
  dp: DoublePlay,
): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: env.NOTIFICATION_EMAIL,
      subject: `KEXP Double Play: ${dp.artist} - ${dp.title}`,
      html: buildHtml(dp),
    }),
  });

  if (!res.ok) {
    console.error(`Email failed: ${res.status} ${await res.text()}`);
  } else {
    console.log(`Email sent: ${dp.artist} - ${dp.title}`);
  }
}

function buildHtml(dp: DoublePlay): string {
  const first = dp.plays[0];
  const time = new Date(first.timestamp).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const count = dp.plays.length;
  const label =
    count === 2 ? "Double" : count === 3 ? "Triple" : `${count}x`;
  const album = first.kexpPlay?.album;
  const yt = dp.youtube_id
    ? `<p style="margin:4px 0"><a href="https://www.youtube.com/watch?v=${dp.youtube_id}" style="color:#1a73e8">Listen on YouTube</a></p>`
    : "";

  const badgeColors: Record<string, [string, string]> = {
    legitimate: ["#e8f5e9", "#2e7d32"],
    partial: ["#fff3e0", "#ef6c00"],
    mistake: ["#fce4ec", "#c62828"],
  };
  const [bg, fg] = badgeColors[dp.classification || ""] || ["#eee", "#333"];
  const badge = dp.classification
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;background:${bg};color:${fg}">${dp.classification}</span>`
    : "";

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 4px">${dp.artist}</h2>
  <h3 style="margin:0 0 12px;font-weight:400;color:#333">${dp.title}</h3>
  ${album ? `<p style="color:#666;margin:4px 0">Album: ${album}</p>` : ""}
  <p style="color:#666;margin:4px 0">${label} Play ${badge}</p>
  <p style="color:#666;margin:4px 0">${time}</p>
  ${dp.dj ? `<p style="color:#666;margin:4px 0">DJ: ${dp.dj}</p>` : ""}
  ${dp.show ? `<p style="color:#666;margin:4px 0">Show: ${dp.show}</p>` : ""}
  ${yt}
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
  <p style="color:#999;font-size:12px">KEXP Double Play Scanner</p>
</div>`;
}

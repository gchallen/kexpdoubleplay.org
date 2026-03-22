import type { DoublePlay } from "@kexp-doubleplay/types";
import type { Env } from "./types";

export async function sendDoublePlayNotification(
  env: Env,
  dp: DoublePlay,
): Promise<void> {
  const count = dp.plays.length;
  const label =
    count === 2 ? "Double" : count === 3 ? "Triple" : `${count}x`;

  const first = dp.plays[0];
  const time = new Date(first.timestamp).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const lines = [
    `${label} Play: ${dp.artist} - ${dp.title}`,
    time,
    dp.dj ? `DJ: ${dp.dj}` : "",
    dp.show ? `Show: ${dp.show}` : "",
    dp.classification && dp.classification !== "legitimate"
      ? `Classification: ${dp.classification}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const url = dp.youtube_id
    ? `https://www.youtube.com/watch?v=${dp.youtube_id}`
    : undefined;

  await ntfySend(env, {
    title: `${dp.artist} - ${dp.title}`,
    message: lines,
    url,
    tags: ["musical_note"],
  });
}

export async function sendWarning(
  env: Env,
  message: string,
): Promise<void> {
  await ntfySend(env, {
    title: "KEXP Scanner Warning",
    message,
    priority: 4,
    tags: ["warning"],
  });
}

interface NtfyMessage {
  title: string;
  message: string;
  url?: string;
  priority?: number;
  tags?: string[];
}

async function ntfySend(env: Env, msg: NtfyMessage): Promise<void> {
  if (!env.NTFY_TOPIC) return;

  const headers: Record<string, string> = {
    Title: msg.title,
  };
  if (msg.url) headers["Click"] = msg.url;
  if (msg.priority) headers["Priority"] = String(msg.priority);
  if (msg.tags) headers["Tags"] = msg.tags.join(",");

  try {
    const res = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
      method: "POST",
      headers,
      body: msg.message,
    });

    if (!res.ok) {
      console.error(`ntfy failed: ${res.status} ${await res.text()}`);
    } else {
      console.log(`ntfy sent: ${msg.title}`);
    }
  } catch (err) {
    console.error(
      `ntfy error: ${err instanceof Error ? err.message : err}`,
    );
  }
}

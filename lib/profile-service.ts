import { createHash, createHmac } from "node:crypto";

export async function profileService(userId: string, path: string, body?: Record<string, unknown>) {
  const base = process.env.JOB_HUNT_SERVICE_URL;
  const secret = process.env.JOB_HUNT_SERVICE_SECRET;
  if (!base || !secret) throw new Error("Profile service is not configured");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = body ? JSON.stringify(body) : undefined;
  const bound = payload ? `${userId}:${timestamp}:${createHash('sha256').update(payload).digest('hex')}` : `${userId}:${timestamp}`;
  const response = await fetch(`${base}${path}`, {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-user-id": userId, "x-timestamp": timestamp,
      "x-signature": createHmac("sha256", secret).update(bound).digest("hex") },
    body: payload, signal: AbortSignal.timeout(60_000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Resume extraction service failed");
  return response.json();
}

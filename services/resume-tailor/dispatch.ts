import type { Pool } from "pg";

const metadata = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
export async function dispatchRequest(pool: Pool, requestId: string) {
  const claimed = await pool.query(`UPDATE resume_dispatch_outbox o
    SET attempts=attempts+1,next_attempt_at=now()+interval '1 minute'
    FROM resume_generation_requests r WHERE o.request_id=$1 AND r.id=o.request_id
      AND r.status='queued' AND o.next_attempt_at<=now() AND o.attempts<10
    RETURNING o.attempts,o.batch_poll_count`, [requestId]);
  if (!claimed.rows[0]) return;
  try {
    const queue = process.env.RESUME_TASK_QUEUE;
    const worker = process.env.RESUME_WORKER_URL;
    const invoker = process.env.RESUME_TASK_INVOKER;
    if (!queue || !worker || !invoker) throw new Error("dispatch_configuration_missing");
    const tokenResponse = await fetch(metadata, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) });
    if (!tokenResponse.ok) throw new Error("dispatch_identity_unavailable");
    const token = await tokenResponse.json() as { access_token: string };
    const taskName = `${queue}/tasks/resume-${requestId}-batch${claimed.rows[0].batch_poll_count}-${claimed.rows[0].attempts}`;
    const response = await fetch(`https://cloudtasks.googleapis.com/v2/${queue}/tasks`, {
      method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ task: { name: taskName, dispatchDeadline: "720s", httpRequest: {
        httpMethod: "POST", url: `${worker}/internal/process`, headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify({ requestId })).toString("base64"),
        oidcToken: { serviceAccountEmail: invoker, audience: worker }
      } } }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok && response.status !== 409) throw new Error(`dispatch_http_${response.status}`);
    await pool.query(`UPDATE resume_dispatch_outbox SET dispatched_at=now(),last_error=NULL,
      next_attempt_at=now()+interval '20 minutes' WHERE request_id=$1`, [requestId]);
  } catch (error) {
    // Saving a request has already committed. Recovery must not reserve another credit.
    const code = error instanceof Error && /^dispatch_[a-z0-9_]+$/.test(error.message) ? error.message : "dispatch_failed";
    await pool.query(`UPDATE resume_dispatch_outbox SET last_error=$2,
      next_attempt_at=now()+make_interval(secs=>LEAST(300,30*power(2,LEAST(attempts,4)))::int)
      WHERE request_id=$1`, [requestId, code]);
    console.error(code, { requestId });
  }
}

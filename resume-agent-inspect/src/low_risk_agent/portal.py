"""Private stdin/stdout adapter. Each usage event must be acknowledged after DB commit."""
from __future__ import annotations

import io
import json
import os
import sys
import uuid
from urllib.error import HTTPError, URLError
from decimal import Decimal
from html import escape


def event(value: dict) -> None:
    print(json.dumps(value), flush=True)
    ack = sys.stdin.readline()
    if ack.strip() != "ok":
        raise RuntimeError("usage persistence was not acknowledged")


def token_reservation(body: dict) -> int:
    """Reserve UTF-8 request bytes, framing overhead, and maximum output.

    This is a conservative estimate, not a provider tokenizer. Actual reported
    token counts remain authoritative, even if a provider exceeds the estimate.
    """
    maximum = body.get("max_tokens")
    if isinstance(maximum, bool) or not isinstance(maximum, int) or maximum <= 0:
        raise ValueError("positive max_tokens required for budget reservation")
    return len(json.dumps(body, ensure_ascii=False).encode("utf-8")) + 1024 + maximum


def resolve_provenance(result) -> list[dict]:
    """Map each tailored claim to the original résumé text it's grounded in.

    Resolves fact_ids -> source_span here, once, so neither Rust nor the
    frontend needs to understand the pipeline's internal "fact" concept —
    the wire shape is just "this tailored line came from these original
    snippets".
    """
    facts_by_id = {fact.fact_id: fact.source_span for fact in result.source_facts}
    return [
        {
            "field_path": claim.field_path,
            "text": claim.text,
            "source_spans": [
                facts_by_id[fact_id] for fact_id in claim.fact_ids if fact_id in facts_by_id
            ],
        }
        for claim in result.claim_provenance
    ]


# .env.example's own placeholder text — long enough to pass a bare length
# check, so a deployment that copies the example file without editing these
# two lines would otherwise silently start trying to connect to a bogus
# localhost URL on every single generation (found by hitting exactly this
# while setting up a live test: every request failed with a DB connection
# timeout, not any actual pipeline problem).
_PLACEHOLDER_CACHE_SECRET = "replace-with-at-least-32-random-characters"


def should_use_postgres_jd_cache(database_url: str, secret: str) -> bool:
    """Both the scoped connection string and a real HMAC secret are required.

    The secret alone (with no database_url) would be pointless; the URL
    alone would either crash (see jd_cache_key's own length check) or, if
    that check were ever loosened, produce guessable cache keys against a
    table with no per-tenant row isolation. Absent either, caching falls
    back to the pipeline's default in-process-only cache untouched.
    """
    return (
        bool(database_url)
        and "replace-me" not in database_url
        and len(secret) >= 32
        and secret != _PLACEHOLDER_CACHE_SECRET
    )


def build_live_disclosure(result) -> dict:
    """Build the disclosure payload for a non-simulated generation.

    Only status == "failed" is a hard failure (raised by the caller before
    this runs). "completed", "completed_with_estimates", and "needs_review"
    all carry a real, already-rendered resume_markdown — discarding it here
    would throw away a draft the pipeline spent tokens producing. The
    caller still gets to see which case it was via needs_review/status.
    """
    markdown = result.resume_markdown
    needs_review = result.status == "needs_review"
    notice = (
        "This draft did not clear every automated compliance check — review it "
        "closely before applying."
        if needs_review
        else "AI-generated resume passed the agent's grounding and review gates. "
        "Review it before applying."
    )
    return {
        "word_count": len(markdown.split()),
        "source_word_count": result.source_word_count,
        "length_mode": result.length_mode,
        "simulated": False,
        "notice": notice,
        "provenance": resolve_provenance(result),
        "status": result.status,
        "needs_review": needs_review,
        "review_notes": result.error.split(", ") if needs_review and result.error else [],
    }


def render_pdf(markdown: str) -> bytes:
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    # Text is escaped before entering ReportLab's paragraph markup parser.
    output = io.BytesIO()
    styles = getSampleStyleSheet()
    story = []
    for line in markdown.splitlines():
        if line.strip():
            style = styles["Heading2"] if line.startswith("#") else styles["BodyText"]
            clean_line = line.lstrip("# ").strip()
            if not clean_line:
                clean_line = line.strip()
            story.append(Paragraph(escape(clean_line), style))
        else:
            story.append(Spacer(1, 6))
    if not story:
        raise ValueError("empty resume")
    SimpleDocTemplate(output, title="Generated resume", leftMargin=48, rightMargin=48).build(story)
    return output.getvalue()


def main() -> None:
    line = sys.stdin.readline()
    if not line:
        return
    try:
        request = json.loads(line)
        simulated = request.get("simulated", False)
        failure = request.get("test_failure")
        store = None
        if request.get("persist_results"):
            if simulated:
                raise ValueError("Simulated generations cannot be saved as factual resumes")
            from .storage import ResumeStore, results_database_url

            store = ResumeStore(results_database_url())
            store.validate_context(
                request["user_id"], request["job_id"], request.get("base_resume_id"),
                request["job_description"],
            )
        if simulated:
            attempt = str(uuid.uuid4())
            event({"type": "usage", "id": attempt, "stage": "test_generation",
                   "provider": "simulated", "model": "deterministic-test", "status": "started",
                   "reserved_tokens": 5500})
            event({"type": "usage", "id": attempt, "stage": "test_generation",
                   "provider": "simulated", "model": "deterministic-test", "status": "reported",
                   "usage": {"prompt_tokens": 4000, "completion_tokens": 1500, "cost": 0.0},
                   "response_id": "simulated-" + attempt})
            if failure == "ai":
                raise RuntimeError("test_ai_failure")
            markdown = "# TEST RESUME — simulated generation\n\n" + request.get("resume", "")
            disclosure = {
                "word_count": len(markdown.split()),
                "source_word_count": len(request.get("resume", "").split()),
                "length_mode": "single_page",
                "simulated": True,
                "notice": (
                    "Simulation only: original resume text, no AI call. "
                    "Token counts are test fixtures; cost is zero."
                ),
                "provenance": [],
                "status": "completed",
                "needs_review": False,
                "review_notes": [],
            }
        else:
            from .cache import PostgresJdAnalysisCache
            from .llm import OpenAICompatibleClient, configure_langsmith_env, inline_rate_limit
            from .models import PipelineConfig, RunRequest
            from .pipeline import ResumeTailoringPipeline

            # Scoped to the resume_agent_cache Postgres role (USAGE+CREATE on
            # schema resume_cache only — see
            # backend/migrations/20260907000000_create_resume_cache_schema.sql),
            # never the app's own DATABASE_URL. A stable HMAC secret is required
            # alongside it: cache keys must be reproducible across every
            # subprocess invocation (each `portal.py` run is a fresh process) or
            # every request is a guaranteed cache miss, and jd_analysis_cache has
            # no per-tenant row isolation by design, so an unguessable key is
            # what keeps one tenant's cached JD analysis from being enumerable
            # by another. Absent either value, caching stays exactly as before
            # (in-process only, no persistence across requests).
            cache_db_url = os.getenv("RESUME_AGENT_CACHE_DATABASE_URL", "")
            cache_secret = os.getenv("JD_CACHE_HMAC_SECRET", "")
            jd_cache = (
                PostgresJdAnalysisCache(cache_db_url)
                if should_use_postgres_jd_cache(cache_db_url, cache_secret)
                else None
            )

            class AccountedClient(OpenAICompatibleClient):
                stage = "unknown"
                calls = 0
                spend = Decimal(0)

                def complete(self, **kwargs):
                    self.stage = kwargs["stage"]
                    return super().complete(**kwargs)

                def transport_recorded(self, endpoint, key, body, timeout):
                    self.calls += 1
                    if self.calls > 20:
                        raise RuntimeError("generation_budget_exhausted")
                    attempt = str(uuid.uuid4())
                    base = {"type": "usage", "id": attempt, "stage": self.stage,
                            "provider": "openrouter", "model": body["model"]}
                    event({**base, "status": "started", "reserved_tokens": token_reservation(body)})
                    try:
                        result = self._post_json(endpoint, key, body, timeout)
                    except HTTPError as error:
                        # Explicit rate-limit rejection can use the existing bounded backoff.
                        if error.code in {401, 402, 403, 429}:
                            event({**base, "status": "reported", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0}})
                            if error.code == 429:
                                raise
                            print(f"[provider] stage={self.stage} http_status={error.code}", file=sys.stderr, flush=True)
                            raise RuntimeError(f"provider_http_{error.code}") from None
                        event({**base, "status": "unknown"})
                        print(f"[provider] stage={self.stage} http_status={error.code}", file=sys.stderr, flush=True)
                        raise RuntimeError(f"provider_http_{error.code}") from None
                    except (TimeoutError, URLError) as error:
                        event({**base, "status": "unknown"})
                        reason = "timeout" if isinstance(error, TimeoutError) or isinstance(getattr(error, "reason", None), TimeoutError) else "network"
                        print(f"[provider] stage={self.stage} failure={reason}", file=sys.stderr, flush=True)
                        raise RuntimeError(f"provider_{reason}_unknown") from None
                    except Exception:
                        event({**base, "status": "unknown"})
                        print(f"[provider] stage={self.stage} failure=invalid_response", file=sys.stderr, flush=True)
                        raise RuntimeError("provider_response_unknown") from None
                    if inline_rate_limit(result) is not None:
                        # OpenRouter is explicit here: the request never ran on
                        # the model, so nothing was billed — unlike the generic
                        # exception case above, this is a known, zero-cost
                        # outcome, not an uncertain one. Report zero usage so
                        # the reservation is released before a safe retry.
                        # Return the raw result as-is so _request()'s own
                        # retry/backoff loop (llm.py) can see and retry it,
                        # instead of this wrapper turning it into a hard
                        # failure before that loop ever gets the chance.
                        event({**base, "status": "reported",
                               "usage": {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0}})
                        return result
                    usage = result.get("usage") or {}
                    event({**base, "status": "reported" if usage else "unknown",
                           "usage": usage, "response_id": result.get("id")})
                    if usage.get("cost") is None:
                        raise RuntimeError("provider_cost_unknown")
                    self.spend += Decimal(str(usage["cost"]))
                    return result

            config = PipelineConfig()
            client = AccountedClient(config)
            client.transport = client.transport_recorded
            run_request = RunRequest(
                original_resume=request["resume"], job_description=request["job_description"],
                tenant_id=request["user_id"], include_summary=request.get("include_summary"),
                allow_synthetic_metrics=False,
            )
            pipeline = ResumeTailoringPipeline(
                config=config,
                llm=client,
                jd_cache=jd_cache,
                cache_secret=cache_secret if jd_cache is not None else None,
            )
            run = pipeline.run
            configure_langsmith_env()
            if os.getenv("RESUME_ENABLE_LANGSMITH") == "1":
                from langsmith import traceable

                run = traceable(
                    name="resume.tailoring_run",
                    run_type="chain",
                    metadata={
                        "generation_id": request.get("generation_id"),
                        "user_id": request.get("user_id"),
                        "job_id": request.get("job_id"),
                        "include_summary": run_request.include_summary,
                        "uses_project_library": bool(run_request.project_library),
                        # Lets a trace be tied back to exactly which prompt/
                        # schema/analyzer revision produced it, without
                        # needing to correlate against a deploy timestamp.
                        "prompt_version": config.analyzer_prompt_version,
                        "schema_version": config.schema_version,
                        "analyzer_version": config.analyzer_version,
                    },
                    tags=["resume-tailoring", "portal"],
                )(pipeline.run)
            result = run(run_request, thread_id=request["generation_id"])
            if result.status == "failed":
                # result.error already carries the pipeline's real internal
                # reason (an exception message caught inside graph.invoke(),
                # see pipeline.py::run()'s own except branch) — surface it
                # instead of a fixed generic string, matching how the
                # {"type":"failed"} path already treats "code" as meaningful
                # (see tailor.rs's own comment on that message branch).
                raise RuntimeError("generation_failed: " + (result.error or "unknown"))
            markdown = result.resume_markdown
            disclosure = build_live_disclosure(result)
        if failure == "render":
            raise RuntimeError("test_render_failure")
        pdf = b"" if request.get("markdown_only") else render_pdf(markdown)
        result_payload = {
            "type": "result", "pdf_hex": pdf.hex(), "disclosure": disclosure,
            "resume_markdown": markdown,
            "audit_json": {"simulated": True} if simulated else result.model_dump(mode="json"),
        }
        if store:
            saved = store.save(
                generation_id=request["generation_id"], user_id=request["user_id"],
                job_id=request["job_id"], base_resume_id=request.get("base_resume_id"),
                result=result,
            )
            result_payload["database_saved"] = True
            result_payload["generation_version"] = saved["version"]
            result_payload["generation_id"] = saved["id"]
        print(json.dumps(result_payload), flush=True)
    except Exception as exc:
        print(json.dumps({"type": "failed", "code": str(exc)[:100]}), flush=True)


if __name__ == "__main__":
    main()

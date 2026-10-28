"""Canonical contract regression tests; no network, database, or provider calls."""

import copy
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import jsonschema
import pytest

from low_risk_agent.document import (
    document_hash,
    document_markdown,
    generated_document,
    source_document,
    source_from_document,
    validate_document,
    validate_edited_document,
)
from low_risk_agent.models import (
    CriticStrategy,
    DraftBullet,
    ExperienceDraft,
    RequirementMapping,
    ResumeDraft,
    SkillsCategory,
    SkillCategoryPlan,
    RunRequest,
)
from low_risk_agent.pipeline import ResumeTailoringPipeline
from fakes import ScriptedLLM, ShortResumePipeline


TEXT = """Jane Doe
jane@example.com
Experience
Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization, reducing latency by 30% across 20 services.
Skills
Cloud: AWS (S3, Lambda), Azure Databricks
Languages: Python, SQL
Education
Example University
Bachelor of Science
2019
"""


def details():
    return {
        "text": TEXT,
        "header": {"name": "Jane Doe", "email": "jane@example.com"},
        "experience_text": TEXT.split("Experience\n")[1].split("\nSkills")[0],
        "experience": [
            {
                "company": "Acme Corp",
                "title": "Senior Engineer",
                "dates": "Jan 2020 - Present",
                "bullets": ["Led API modernization, reducing latency by 30% across 20 services."],
            }
        ],
        "skills": "Cloud: AWS (S3, Lambda), Azure Databricks\nLanguages: Python, SQL",
        "education": "Example University\nBachelor of Science\n2019",
        "educationHistory": [
            {"college": "Example University", "degree": "Bachelor of Science", "dates": "2019"}
        ],
    }


def source(geometry=True):
    pages = (
        [
            {
                "number": 1,
                "text": TEXT,
                "start": 0,
                "words": [{"start": 0, "end": len(TEXT), "box": [1000, 1000, 500000, 700000]}],
            }
        ]
        if geometry
        else []
    )
    return source_document(details(), "a" * 64, "11111111-1111-4111-8111-111111111111", pages)


def generated():
    canonical = source()
    facts = source_from_document(canonical, TEXT)
    body = next(f for f in facts.facts if f.kind == "responsibility")
    draft = ResumeDraft(
        summary=[],
        experience=[
            ExperienceDraft(
                role_id="role-1",
                title="Unsupported renamed title",
                bullets=[
                    DraftBullet(
                        text=body.source_span,
                        purpose="experience",
                        fact_ids=[body.fact_id],
                        ownership_level="lead",
                        metrics=[],
                    )
                ],
            )
        ],
        projects=[],
        skills=[
            SkillsCategory(category=g["category"], items=[b["text"] for b in g["items"]])
            for g in canonical["skills"]
        ],
    )
    return generated_document(draft, facts, canonical), canonical


def audit(document, canonical):
    return {
        "status": "completed",
        "source_document": canonical,
        "resume_document": document,
        "compliance_ledger": [
            {"code": "semantic.support", "passed": True, "severity": "info", "waiver": ""}
        ],
    }


def test_schema_hash_spans_and_geometry():
    value = source()
    schema = json.loads(
        (
            Path(__file__).resolve().parents[2] / "contracts/resume-document-v1.schema.json"
        ).read_text()
    )
    jsonschema.Draft202012Validator(schema).validate(value)
    assert value["source"]["textSha256"] == hashlib.sha256(TEXT.encode()).hexdigest()
    for item in value["evidence"]:
        assert TEXT[item["spanStart"] : item["spanEnd"]] == item["sourceSpan"]
        assert item["page"] == 1 and item["box"] == [1000, 1000, 500000, 700000]
    independent = hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()
    assert document_hash(value) == independent
    assert document_hash(dict(reversed(list(value.items())))) == independent
    assert value["skills"][0]["items"][0]["text"] == "AWS (S3, Lambda)"
    assert value["sectionOrder"] == ["experience", "skills", "education"]


@pytest.mark.parametrize(
    "mutation",
    [
        lambda d: d.update(unexpected=True),
        lambda d: d.update(revision=True),
        lambda d: d["summary"].append({"id": "missing", "text": "unsupported", "evidenceIds": []}),
        lambda d: d["evidence"][0].update(spanEnd=999),
        lambda d: d["evidence"][0].update(box=[0, 0, 0, 0]),
        lambda d: d["experience"][0].update(id="personal"),
        lambda d: d["evidence"][0].update(fieldId="nonexistent"),
        lambda d: d["evidence"][0].update(roleId="role-1"),
        lambda d: d["sectionOrder"].append("experience"),
    ],
)
def test_schema_and_relational_negative_controls(mutation):
    value = source()
    mutation(value)
    with pytest.raises(ValueError):
        validate_document(value)


def test_generation_copies_protected_fields_and_never_parses_markdown():
    value, canonical = generated()
    assert value["personalInfo"] == canonical["personalInfo"]
    assert value["experience"][0]["role"] == "Senior Engineer"
    assert value["experience"][0]["company"] == "Acme Corp"
    assert value["education"] == canonical["education"]
    assert value["skills"] == canonical["skills"]
    assert "Senior Engineer | Acme Corp | Jan 2020 - Present" in document_markdown(value)
    assert validate_edited_document(value, canonical, audit(value, canonical)) == []
    facts = source_from_document(canonical, TEXT.replace("\n", "\r\n"))
    assert any(f.kind == "metric" and f.source_span == "30%" for f in facts.facts)


def test_source_hash_mismatch_and_missing_geometry_rejected():
    with pytest.raises(ValueError, match="hash"):
        source_from_document(source(), TEXT + "tampered")
    with pytest.raises(ValueError, match="geometry"):
        source_document(
            details(), "a" * 64, "confirmed", [{"number": 1, "text": TEXT, "words": []}]
        )
    data = details()
    data["experience"][0]["title"] = "Director"
    with pytest.raises(ValueError):
        source_document(data, "a" * 64, "confirmed")


def test_role_evidence_cannot_be_reassigned_or_edited():
    value, canonical = generated()
    prior = audit(copy.deepcopy(value), canonical)
    value["experience"][0]["company"] = "Unrelated Employer"
    assert any(
        i["code"] == "protected.field" for i in validate_edited_document(value, canonical, prior)
    )
    value, canonical = generated()
    prior = audit(copy.deepcopy(value), canonical)
    value["evidence"][-1]["sourceSpan"] = "x" * len(value["evidence"][-1]["sourceSpan"])
    assert any(
        i["code"].startswith("evidence.") for i in validate_edited_document(value, canonical, prior)
    )


def test_edits_preserve_ids_and_unknown_facts_fail_closed():
    value, canonical = generated()
    prior = audit(copy.deepcopy(value), canonical)
    value["experience"][0]["bullets"][0]["text"] = "Invented a 500% revenue increase with Rust."
    assert any(
        i["code"] == "claim.uncertain" for i in validate_edited_document(value, canonical, prior)
    )
    value["experience"][0]["bullets"][0]["text"] = canonical["experience"][0]["bullets"][0][
        "text"
    ].replace(" ", "  ")
    assert validate_edited_document(value, canonical, prior) == []
    failed = audit(copy.deepcopy(value), canonical)
    failed["compliance_ledger"][0].update(passed=False, severity="error", waiver="human_review")
    assert any(
        i["code"] == "audit.failed_checks"
        for i in validate_edited_document(value, canonical, failed)
    )
    assert validate_edited_document(value, canonical, {})


def test_certified_pipeline_uses_canonical_source_with_legacy_text_hash():
    canonical = source()
    pipeline = ShortResumePipeline(llm=ScriptedLLM())
    request = RunRequest(
        original_resume="# compatibility input",
        source_text=TEXT,
        source_document=canonical,
        job_description="Build Python systems.",
        tenant_id="test",
        include_summary=False,
    )
    state = pipeline.prepare_source({"request": request, "usage": []})
    assert state["source"].roles[0].group_id == "role-1"
    assert state["resume_hash"] == hashlib.sha256(request.original_resume.encode()).hexdigest()
    assert not pipeline.llm.calls
    state.update(
        request=request,
        revision_count=2,
        compliance_ledger=[
            type(
                "Check",
                (),
                {"passed": False, "severity": "error", "waiver": "", "code": "semantic.support"},
            )()
        ],
        violation_history=[type("Snapshot", (), {"phase": "semantic"})()],
    )
    assert pipeline.route_review(state) == "needs_review"


def test_complete_canonical_generation_has_no_markdown_reparse(monkeypatch):
    canonical = source()

    def forbidden(*args, **kwargs):
        raise AssertionError("Canonical input was reparsed")

    monkeypatch.setattr("low_risk_agent.pipeline.extract_source", forbidden)
    pipeline = ShortResumePipeline(llm=ScriptedLLM())
    result = pipeline.run(
        RunRequest(
            original_resume=document_markdown(canonical),
            source_text=TEXT,
            source_document=canonical,
            job_description="Build Python services.",
            tenant_id="test",
            include_summary=False,
        )
    )
    assert result.status == "completed", result.error
    assert result.resume_document and result.source_document == canonical
    assert (
        validate_edited_document(result.resume_document, canonical, result.model_dump(mode="json"))
        == []
    )


def test_naturally_short_source_passes_default_pipeline_without_filler():
    canonical = source()
    pipeline = ResumeTailoringPipeline(llm=ScriptedLLM())
    result = pipeline.run(
        RunRequest(
            original_resume=document_markdown(canonical),
            source_text=TEXT,
            source_document=canonical,
            job_description="Build Python services.",
            tenant_id="test",
            include_summary=False,
        )
    )
    assert result.status == "completed", result.error
    assert result.word_count < 100
    assert result.revision_count == 0
    assert pipeline.llm.counts["fit_length"] == 0
    assert (
        result.resume_document["experience"][0]["bullets"][0]["text"]
        == canonical["experience"][0]["bullets"][0]["text"]
    )
    retention = next(c for c in result.compliance_ledger if c.code == "length.word_count")
    assert retention.passed and retention.severity == "error"


def test_canonical_retention_rejects_dropped_source_claim():
    canonical = source()
    pipeline = ResumeTailoringPipeline(llm=ScriptedLLM())
    request = RunRequest(
        original_resume=document_markdown(canonical),
        source_text=TEXT,
        source_document=canonical,
        job_description="Build Python services.",
        tenant_id="test",
        include_summary=False,
    )
    state = {"request": request, **pipeline.prepare_source({"request": request, "usage": []})}
    state.update(pipeline.analyze_jd(state))
    state.update(pipeline.map_adjacency(state))
    state.update(pipeline.craft(state))
    state["draft"] = state["draft"].model_copy(update={"experience": []})
    checks = pipeline.lint(state)["lint_checks"]
    assert any(c.code == "length.word_count" and not c.passed for c in checks)
    state["compliance_ledger"] = checks
    output = pipeline.needs_review(state)
    assert output["terminal_status"] == "failed"
    assert not output["resume_markdown"]


def test_naturally_short_graduate_without_employment_can_complete():
    data = details()
    data["text"] = data["text"].replace("Experience\n" + data["experience_text"] + "\n", "")
    data.pop("experience")
    data.pop("experience_text")
    text = data["text"]
    canonical = source_document(
        data,
        "a" * 64,
        "11111111-1111-4111-8111-111111111111",
        [
            {
                "number": 1,
                "text": text,
                "words": [{"start": 0, "end": len(text), "box": [1000, 1000, 500000, 700000]}],
            }
        ],
    )

    def mapping(payload):
        skills = [f for f in payload["resume_facts"] if f["kind"] == "skill"]
        return CriticStrategy(
            mappings=[
                RequirementMapping(
                    requirement_id="R1", fact_ids=[skills[0]["fact_id"]], safe_adjacent_phrasing=[]
                )
            ],
            verified_skill_allowlist=[f["source_span"] for f in skills],
            unsupported_gaps=[],
            skill_categories=[
                SkillCategoryPlan(category="Technical", items=[f["source_span"] for f in skills])
            ],
        )

    pipeline = ResumeTailoringPipeline(llm=ScriptedLLM({"map_adjacency": mapping}))
    result = pipeline.run(
        RunRequest(
            original_resume=document_markdown(canonical),
            source_text=text,
            source_document=canonical,
            job_description="Build Python services.",
            tenant_id="test",
            include_summary=False,
        )
    )
    assert result.status == "completed", result.error
    assert not result.resume_document["experience"]
    assert result.resume_document["education"] == canonical["education"]
    assert result.word_count < 100 and result.revision_count == 0


def test_summary_and_promoted_tool_keep_original_role_and_geometry():
    canonical = source()
    facts = source_from_document(canonical, TEXT)
    body = next(f for f in facts.facts if f.kind == "responsibility")
    summary = DraftBullet(
        text=body.source_span,
        purpose="summary",
        fact_ids=[body.fact_id],
        ownership_level="lead",
        metrics=[],
    )
    draft = ResumeDraft(summary=[summary], experience=[], projects=[], skills=[])
    generated = generated_document(draft, facts, canonical)
    evidence = next(e for e in generated["evidence"] if e["fieldId"] == "summary-1")
    assert evidence["roleId"] == "role-1"
    original = next(e for e in canonical["evidence"] if e["id"] == body.fact_id)
    assert (evidence["sourceSpan"], evidence["box"]) == (original["sourceSpan"], original["box"])


def test_wrapped_project_evidence_and_additional_heading_alias():
    data = details()
    tail = "\nProjects\nSearch Tool\n- Built a Python search engine\n  for internal developers.\n\nOther Tool\n- Added reliable tests.\nCertificates\nCloud Practitioner"
    data["text"] += tail
    data["projects"] = tail.split("Projects\n")[1].split("\nCertificates")[0]
    data["certifications"] = "Cloud Practitioner"
    value = source_document(data, "a" * 64, "confirmed")
    assert len(value["projects"]) == 2
    assert (
        value["projects"][0]["bullets"][0]["text"]
        == "Built a Python search engine for internal developers."
    )
    assert value["additionalSections"][0]["title"] == "Certificates"


def test_source_display_cannot_be_forged_even_with_real_spans():
    canonical = source()
    canonical["personalInfo"]["name"] = "Unsupported Name"
    with pytest.raises(ValueError, match="not supported"):
        source_from_document(canonical, TEXT)


def test_header_title_repeated_in_employment_has_header_evidence():
    data = details()
    data["header"]["title"] = "Senior Engineer"
    data["text"] = data["text"].replace("Jane Doe\n", "Jane Doe\nSenior Engineer\n", 1)
    canonical = source_document(data, "a" * 64, "confirmed")
    evidence = next(e for e in canonical["evidence"] if e["fieldId"] == "personal.title")
    assert evidence["spanStart"] == len("Jane Doe\n")
    assert canonical["experience"][0]["role"] == canonical["personalInfo"]["title"]


def test_titles_accept_contiguous_source_text_and_unknown_titles_need_review():
    value, canonical = generated()
    trusted = audit(copy.deepcopy(value), canonical)
    value["experience"][0]["role"] = "Engineer"
    assert validate_edited_document(value, canonical, trusted) == []
    value["experience"][0]["role"] = "Director of Engineering"
    issues = validate_edited_document(value, canonical, trusted)
    assert any(i["code"] == "claim.uncertain" and i["fieldId"] == "role-1.role" for i in issues)
    assert not any(i["code"] == "protected.field" for i in issues)


def test_exact_source_replacement_and_cli_rejection(tmp_path):
    value, canonical = generated()
    value["experience"][0]["bullets"][0]["text"] = "Led source-backed API modernization."
    trusted = audit(copy.deepcopy(value), canonical)
    value["experience"][0]["bullets"][0]["text"] = canonical["experience"][0]["bullets"][0]["text"]
    assert validate_edited_document(value, canonical, trusted) == []
    paths = {name: tmp_path / (name + ".json") for name in ("edit", "source", "audit")}
    for name, data in [("edit", value), ("source", canonical), ("audit", trusted)]:
        paths[name].write_text(json.dumps(data), encoding="utf-8")
    env = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src")}
    command = [
        sys.executable,
        "-m",
        "low_risk_agent.document",
        "--validate-document-file",
        str(paths["edit"]),
        "--source-document",
        str(paths["source"]),
        "--audit",
        str(paths["audit"]),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, env=env, timeout=20)
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout) == {"valid": True, "issues": []}
    value["experience"][0]["bullets"][0]["text"] = "Invented a billion dollars of revenue."
    paths["edit"].write_text(json.dumps(value), encoding="utf-8")
    blocked = subprocess.run(command, capture_output=True, text=True, env=env, timeout=20)
    assert blocked.returncode == 1
    assert not json.loads(blocked.stdout)["valid"]


def test_profile_bundle_matches_authoritative_module():
    package = Path(__file__).resolve().parents[2]
    canonical = package / "resume-agent-inspect/src/low_risk_agent/document.py"
    bundled = package / "services/job-hunt-profile/service/resume_document.py"
    assert bundled.read_bytes() == canonical.read_bytes()
    schema = (package / "contracts/resume-document-v1.schema.json").read_bytes()
    assert canonical.with_name("resume-document-v1.schema.json").read_bytes() == schema
    assert bundled.with_name("resume-document-v1.schema.json").read_bytes() == schema

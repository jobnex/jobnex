import unittest

from low_risk_agent.models import ClaimProvenance, SourceFact
from low_risk_agent.portal import resolve_provenance


class FakeResult:
    def __init__(self, source_facts, claim_provenance):
        self.source_facts = source_facts
        self.claim_provenance = claim_provenance


def _fact(fact_id: str, span: str) -> SourceFact:
    return SourceFact(
        fact_id=fact_id,
        kind="responsibility",
        source_span=span,
        span_start=0,
        span_end=len(span),
        role_or_project_id="role_1",
        ownership_level="contributor",
    )


class ProvenanceTests(unittest.TestCase):
    def test_resolves_fact_ids_to_original_text(self):
        result = FakeResult(
            source_facts=[_fact("F0001", "Built a data pipeline in Spark"), _fact("F0002", "Reduced latency 40%")],
            claim_provenance=[
                ClaimProvenance(
                    field_path="experience.role_1.bullet_0",
                    text="Built a Spark data pipeline, cutting latency by 40%.",
                    fact_ids=["F0001", "F0002"],
                    metrics=[],
                )
            ],
        )
        provenance = resolve_provenance(result)
        self.assertEqual(len(provenance), 1)
        entry = provenance[0]
        self.assertEqual(entry["field_path"], "experience.role_1.bullet_0")
        self.assertEqual(entry["text"], "Built a Spark data pipeline, cutting latency by 40%.")
        self.assertEqual(
            entry["source_spans"], ["Built a data pipeline in Spark", "Reduced latency 40%"]
        )

    def test_unknown_fact_ids_are_dropped_not_crashed_on(self):
        result = FakeResult(
            source_facts=[_fact("F0001", "Led a team of 5 engineers")],
            claim_provenance=[
                ClaimProvenance(
                    field_path="experience.role_1.bullet_0",
                    text="Led a team of 5 engineers.",
                    fact_ids=["F0001", "F9999"],
                    metrics=[],
                )
            ],
        )
        entry = resolve_provenance(result)[0]
        self.assertEqual(entry["source_spans"], ["Led a team of 5 engineers"])

    def test_empty_claims_resolve_to_empty_list(self):
        result = FakeResult(source_facts=[], claim_provenance=[])
        self.assertEqual(resolve_provenance(result), [])


if __name__ == "__main__":
    unittest.main()

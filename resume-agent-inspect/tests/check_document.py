"""Run the canonical contract or complete offline agent suite in workspace temp."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

root = Path(__file__).resolve().parents[1]
scratch = root / ".test-tmp"
scratch.mkdir(exist_ok=True)
os.environ["TEMP"] = os.environ["TMP"] = str(scratch)
tempfile.tempdir = str(scratch)
sys.path.insert(0, str(root / "src"))
sys.path.insert(0, str(root / "tests"))
target = "tests" if "--full" in sys.argv else "tests/test_document.py"
with tempfile.TemporaryDirectory(prefix="canonical-check-", dir=scratch) as temporary:
    status = pytest.main([target, "-q", "--basetemp", str(Path(temporary) / "pytest")])
if status == 0:
    print("CANONICAL_AGENT_CHECKS_COMPLETE")
raise SystemExit(status)

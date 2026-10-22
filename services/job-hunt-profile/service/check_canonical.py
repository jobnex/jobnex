"""Run offline profile import checks with writable workspace temporary files."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

root = Path(__file__).resolve().parents[1]
scratch = root / ".test-tmp"
scratch.mkdir(exist_ok=True)
os.environ["TEMP"] = os.environ["TMP"] = str(scratch)
os.environ["JOB_HUNT_SERVICE_SECRET"] = "canonical-tests-only"
tempfile.tempdir = str(scratch)
sys.path.insert(0, str(root))
try:
    import pdfplumber
except ImportError:
    bundled = (
        Path.home()
        / ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/Lib/site-packages"
    )
    if not bundled.is_dir():
        raise
    sys.path.append(str(bundled))
modules = [
    "service.test_canonical_document",
    "service.test_main",
    "service.test_contacts",
    "service.test_resume_content",
    "service.test_document_structure",
]
suite = unittest.defaultTestLoader.loadTestsFromNames(modules)
result = unittest.TextTestRunner(verbosity=1).run(suite)
if result.wasSuccessful():
    print("CANONICAL_PROFILE_CHECKS_COMPLETE")
raise SystemExit(0 if result.wasSuccessful() else 1)

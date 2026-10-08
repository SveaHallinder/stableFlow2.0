#!/usr/bin/env python3
"""Source/default-mode regressions only. This file never starts PostgreSQL."""

import ast
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent
DRIVER = ROOT / "replay_notify_access.py"


class SourceOnly(unittest.TestCase):
    def test_safe_default_with_all_subprocess_entrypoints_forbidden(self):
        namespace = runpy.run_path(str(DRIVER), run_name="not_main")
        with patch("subprocess.run", side_effect=AssertionError("Unexpected process")), \
             patch("subprocess.check_output", side_effect=AssertionError("Unexpected process")), \
             patch("subprocess.Popen", side_effect=AssertionError("Unexpected process")):
            result = namespace["source_check"]()
        self.assertEqual(result["status"], "SOURCE_CHECK_PASS_RUNTIME_NOT_RUN")
        self.assertEqual(result["sql_runtime_calls"], 0)
        self.assertEqual(result["acl_sql_sha256"], namespace["ACL_SHA"])

    def test_default_and_explicit_source_check_are_equivalent(self):
        outputs = []
        for args in ([], ["--source-check"]):
            done = subprocess.run([sys.executable, "-B", str(DRIVER), *args],
                                  capture_output=True, text=True, timeout=5)
            self.assertEqual(done.returncode, 0, done.stderr)
            outputs.append(json.loads(done.stdout))
        self.assertEqual(outputs[0], outputs[1])
        self.assertEqual(outputs[0]["provider_requests"], 0)

    def test_exact_acl_fixture_tamper_is_rejected_without_processes(self):
        directory = Path(tempfile.mkdtemp(prefix="source-negative-", dir=ROOT))
        try:
            shutil.copytree(ROOT / "fixtures", directory / "fixtures")
            shutil.copy2(DRIVER, directory / DRIVER.name)
            shutil.copy2(ROOT / "bindings.json", directory / "bindings.json")
            candidate = directory / "fixtures/acl.sql"
            candidate.write_text(candidate.read_text().replace("from public,anon,authenticated", "from anon,authenticated"))
            namespace = runpy.run_path(str(directory / DRIVER.name), run_name="not_main")
            with patch("subprocess.run", side_effect=AssertionError("Unexpected process")), \
                 patch("subprocess.check_output", side_effect=AssertionError("Unexpected process")), \
                 patch("subprocess.Popen", side_effect=AssertionError("Unexpected process")):
                with self.assertRaisesRegex(AssertionError, "Fixture hash mismatch"):
                    namespace["source_check"]()
        finally:
            shutil.rmtree(directory)

    def test_runtime_gate_precedes_postgresql_discovery(self):
        namespace = runpy.run_path(str(DRIVER), run_name="not_main")
        with patch.object(sys, "platform", "darwin"), \
             patch("subprocess.run", side_effect=AssertionError("Unexpected process")), \
             patch("subprocess.check_output", side_effect=AssertionError("Unexpected process")), \
             patch("subprocess.Popen", side_effect=AssertionError("Unexpected process")):
            with self.assertRaisesRegex(SystemExit, "Runtime requires Linux and a non-root"):
                namespace["run_runtime"](Path("/tmp/synthetic-never-written.json"), {})

    def test_bundle_has_only_bound_synthetic_fixtures_and_valid_python(self):
        ast.parse(DRIVER.read_text())
        binding = json.loads((ROOT / "bindings.json").read_text())
        for name, digest in binding["fixtures"].items():
            self.assertEqual(hashlib.sha256((ROOT / "fixtures" / name).read_bytes()).hexdigest(), digest)
        fixture = (ROOT / "fixtures/fixture.sql").read_text()
        self.assertNotIn("create extension", fixture.lower())
        self.assertNotIn("@", fixture)
        self.assertNotIn(".env", fixture)


if __name__ == "__main__":
    unittest.main(verbosity=2)

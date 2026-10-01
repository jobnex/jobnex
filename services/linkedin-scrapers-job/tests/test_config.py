"""Check database configuration without loading scraper dependencies or contacting Neon."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


class DatabaseConfigTests(unittest.TestCase):
    def get_url(self, values):
        source = Path(__file__).resolve().parents[1] / "scrapers/base_scraper.py"
        tree = ast.parse(source.read_text(encoding="utf-8-sig"))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "get_db_url")
        namespace = {"os": SimpleNamespace(getenv=values.get)}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), namespace)
        return namespace["get_db_url"]()

    def test_missing_configuration_fails(self):
        with self.assertRaisesRegex(RuntimeError, "required"):
            self.get_url({})

    def test_database_environment_is_used(self):
        self.assertEqual(self.get_url({"DATABASE_URL": "postgresql://fixture"}), "postgresql://fixture")

    def test_trail_setting_takes_precedence(self):
        self.assertEqual(self.get_url({"TRAIL_DEV_DB_URL": "postgresql://primary", "DATABASE_URL": "postgresql://secondary"}), "postgresql://primary")


if __name__ == "__main__":
    unittest.main()

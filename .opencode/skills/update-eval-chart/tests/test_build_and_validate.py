#!/usr/bin/env python3

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "build_and_validate.py"
SPEC = importlib.util.spec_from_file_location("build_and_validate", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SnapshotTests(unittest.TestCase):
    def write_snapshot(self, directory: Path, name: str, body: str) -> Path:
        path = directory / name
        path.write_text(body, encoding="utf-8")
        return path

    def test_parses_rows_and_tied_winners(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_snapshot(
                Path(tmp),
                "hausa-2026-10-12.csv",
                """# title: Hausa Evaluation of Audio AI Models
# date: 2026-10-12
# byline: Gooey.AI and partners
Workflow,Accuracy (mean),Latency (median)
Model A,0.70,12.00
Model B,0.70,11.00
Model C,0.60,11.00
""",
            )
            metadata, rows = MODULE.parse_snapshot(path)
            self.assertEqual(metadata["date"], "2026-10-12")
            self.assertEqual(len(rows), 3)
            self.assertEqual(
                MODULE.winners(rows, "accuracy", "max"), ["Model A", "Model B"]
            )
            self.assertEqual(
                MODULE.winners(rows, "latency", "min"), ["Model B", "Model C"]
            )

    def test_rejects_duplicate_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_snapshot(
                Path(tmp),
                "igbo-2026-10-12.csv",
                """# title: Igbo Evaluation of Audio AI Models
# date: 2026-10-12
# byline: Gooey.AI and partners
Workflow,Accuracy,Latency
Model A,0.70,12.00
Model A,0.60,11.00
""",
            )
            with self.assertRaisesRegex(SystemExit, "Duplicate workflow"):
                MODULE.parse_snapshot(path)

    def test_rejects_filename_date_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_snapshot(
                Path(tmp),
                "swahili-2026-10-11.csv",
                """# title: Swahili Evaluation of Audio AI Models
# date: 2026-10-12
# byline: Gooey.AI and partners
Workflow,Accuracy,Latency
Model A,0.70,12.00
""",
            )
            with self.assertRaisesRegex(SystemExit, "must include metadata date"):
                MODULE.parse_snapshot(path)

    def test_prefers_explicit_chrome_environment(self):
        original = MODULE.os.environ.get("CHROME")
        try:
            MODULE.os.environ["CHROME"] = "/bin/sh"
            self.assertEqual(MODULE.chrome_candidates()[0], str(Path("/bin/sh").resolve()))
        finally:
            if original is None:
                MODULE.os.environ.pop("CHROME", None)
            else:
                MODULE.os.environ["CHROME"] = original


if __name__ == "__main__":
    unittest.main()

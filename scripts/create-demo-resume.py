"""Create only a labelled synthetic upload fixture; never a real candidate resume."""
from pathlib import Path
import sys
from xml.sax.saxutils import escape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

source = Path(__file__).resolve().parents[1] / "tests/fixtures/projectwise-demo.md"
destination = Path(sys.argv[1])
destination.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles["BodyText"].fontSize = 9
styles["BodyText"].leading = 12
story = []
for line in source.read_text(encoding="utf-8").splitlines():
    if not line:
        story.append(Spacer(1, 5))
        continue
    level = len(line) - len(line.lstrip("#"))
    style = styles["Title" if level == 1 else "Heading2" if level == 2 else "Heading3" if level == 3 else "BodyText"]
    story.append(Paragraph(escape(line.lstrip("# ")), style))
SimpleDocTemplate(str(destination), leftMargin=40, rightMargin=40, topMargin=32, bottomMargin=32).build(story)
print(f"Synthetic fixture created: {destination}")

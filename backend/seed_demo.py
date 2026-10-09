import argparse
import random
import uuid
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path

import pyodbc
from PIL import Image, ImageDraw

from app.main import UPLOAD_DIR, connection_string


DEMO_MARKER = "[DEMO]"
DEMO_IMAGE = "demo-garbage.png"
STATUSES = ("Reported", "In progress", "Resolved")
AREAS = (
    "Maple Street", "Riverside Park", "Cedar Avenue", "Central Market",
    "Lakeview Road", "Old Town Square", "Hillcrest Lane", "Station Road",
    "Garden District", "Oakwood Crossing", "Sunrise Boulevard", "Mill Street",
    "West End", "Greenfield Park", "Harbor Road", "Meadow Lane",
    "Pine Street", "City Center", "Brookside Walk", "Southgate Avenue",
)
ISSUES = (
    "Overflowing public bin near the footpath",
    "Household rubbish dumped beside the road",
    "Plastic packaging and bottles scattered near the bus stop",
    "Construction debris left beside the sidewalk",
    "Mixed waste piled up near the park entrance",
    "Illegal dumping beside the community noticeboard",
    "Litter gathered around the storm drain",
    "Cardboard and bags blocking the walking path",
    "Waste left beside a full collection point",
    "Discarded furniture beside the service lane",
)


def make_demo_image(destination: Path) -> None:
    image = Image.new("RGB", (900, 540), "#dce9d6")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 900, 310), fill="#dce9d6")
    draw.ellipse((660, 48, 760, 148), fill="#f1d99b")
    draw.rectangle((0, 306, 900, 373), fill="#8eaa81")
    draw.rectangle((0, 373, 900, 540), fill="#c6b99f")
    draw.polygon(((290, 540), (400, 373), (580, 373), (720, 540)), fill="#b8aa90")
    for x, height, color in ((140, 140, "#a7b99a"), (350, 190, "#879e82"), (620, 156, "#b1c0a4")):
        draw.rectangle((x, 306 - height, x + 100, 306), fill=color)
        for wx in range(x + 17, x + 90, 28):
            for wy in range(306 - height + 18, 290, 34):
                draw.rectangle((wx, wy, wx + 9, wy + 12), fill="#e5ead8")
    draw.rectangle((734, 254, 790, 337), fill="#41684d")
    draw.rectangle((728, 248, 796, 260), fill="#31573f")
    draw.ellipse((30, 242, 103, 318), fill="#5f8057")
    draw.rectangle((62, 304, 72, 356), fill="#987b5d")
    draw.text((28, 28), "COMMUNITY CLEANUP  /  DEMO IMAGE", fill="#3e6143")
    draw.text((30, 474), "Sample report photo - replace with a real image when testing uploads.", fill="#425544")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG", optimize=True)


def build_reports(count: int) -> list[tuple]:
    randomizer = random.Random(20261008)
    now = datetime.now().replace(microsecond=0)
    rows = []
    for index in range(1, count + 1):
        days_ago = randomizer.randint(0, 120)
        observed = now - timedelta(
            days=days_ago,
            hours=randomizer.randint(0, 23),
            minutes=randomizer.randrange(0, 60),
        )
        rows.append((
            str(uuid.uuid4()),
            f"{DEMO_MARKER} {randomizer.choice(ISSUES)} (sample {index:04d})",
            randomizer.choice(AREAS),
            observed,
            DEMO_IMAGE,
            randomizer.choices(STATUSES, weights=(42, 28, 30), k=1)[0],
            f"Demo Resident {index:04d}" if index % 3 else None,
            f"resident{index:04d}@example.com" if index % 4 else None,
            f"+1-202-555-{index % 10000:04d}" if index % 5 else None,
        ))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Insert clearly marked demo reports into the local CleanCity database.")
    parser.add_argument("--count", type=int, default=2000, help="Number of demo reports to insert (default: 2000).")
    args = parser.parse_args()
    if not 1 <= args.count <= 10000:
        parser.error("--count must be between 1 and 10000.")

    with closing(pyodbc.connect(connection_string(), timeout=5)) as connection:
        cursor = connection.cursor()
        existing = cursor.execute(
            "SELECT COUNT(*) FROM dbo.GarbageReports WHERE LEFT(Description, ?) = ?",
            len(DEMO_MARKER),
            DEMO_MARKER,
        ).fetchone()[0]
        if existing:
            raise SystemExit(f"Found {existing} existing [DEMO] reports; refusing to add duplicates.")

        image_path = UPLOAD_DIR / DEMO_IMAGE
        make_demo_image(image_path)
        rows = build_reports(args.count)
        cursor.fast_executemany = True
        try:
            cursor.executemany(
                """
                INSERT INTO dbo.GarbageReports
                    (Id, Description, Area, ReportedAt, ImageFilename, Status,
                     ContactName, ContactEmail, ContactPhone)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.commit()
        except Exception:
            connection.rollback()
            image_path.unlink(missing_ok=True)
            raise

    print(f"Inserted {len(rows)} demo reports into the configured SQL Server database.")
    print(f"Demo image: {image_path}")
    print("All demo descriptions start with [DEMO]; reporter details use reserved example.com data.")


if __name__ == "__main__":
    main()

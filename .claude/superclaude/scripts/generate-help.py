#!/usr/bin/env python3
"""Regenerate the command table in .claude/commands/sc/help.md from the
command files themselves.

Upstream's table is maintained by hand and drifts out of date -- help.md
carries its own note saying so. Run this after adding, removing or renaming
a command, or after pulling in a new SuperClaude release.

    python3 .claude/superclaude/scripts/generate-help.py [--check]

--check exits non-zero if the table is stale, without writing.
"""

import re
import sys
from pathlib import Path

COMMANDS_DIR = Path(__file__).resolve().parents[2] / "commands" / "sc"
HELP_FILE = COMMANDS_DIR / "help.md"
TABLE_HEADER = "| Command | Description |"


def description_of(path: Path) -> str:
    """Pull a one-line description out of a command file.

    Most commands carry YAML frontmatter with a `description:` key. Some
    instead wrap a YAML block in a code fence and call the key `purpose:`
    (business-panel.md), and at least one is missing its opening `---`
    delimiter, so scan the whole head of the file rather than trusting the
    frontmatter delimiters.
    """
    head = path.read_text(encoding="utf-8").split("\n", 30)[:30]
    for key in ("description", "purpose"):
        for line in head:
            match = re.match(rf'^\s*{key}:\s*(.+?)\s*$', line)
            if match:
                return match.group(1).strip().strip('"').strip("'")
    return ""


def build_table() -> tuple[str, list[str]]:
    rows, missing = [], []
    for path in sorted(COMMANDS_DIR.glob("*.md"), key=lambda p: p.stem):
        name = path.stem
        desc = description_of(path)
        if not desc:
            missing.append(name)
        rows.append(f"| `/sc:{name}` | {desc} |")
    return "\n".join([TABLE_HEADER, "|---|---|", *rows]), missing


def main() -> int:
    check_only = "--check" in sys.argv
    table, missing = build_table()

    text = HELP_FILE.read_text(encoding="utf-8")
    if TABLE_HEADER not in text:
        print(f"error: table header not found in {HELP_FILE}", file=sys.stderr)
        return 2

    # Replace the header, its separator, and every row that follows it.
    pattern = re.compile(
        re.escape(TABLE_HEADER) + r"\n\|[-| ]+\|\n(?:\|.*\n)*", re.MULTILINE
    )
    updated = pattern.sub(table + "\n", text, count=1)

    count = table.count("\n| `/sc:")
    if updated == text:
        print(f"help.md already lists all {count} commands.")
        return 0
    if check_only:
        print(f"help.md is stale ({count} commands on disk).", file=sys.stderr)
        return 1

    HELP_FILE.write_text(updated, encoding="utf-8")
    print(f"help.md regenerated with {count} commands.")
    for name in missing:
        print(f"  warning: no description found for /sc:{name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

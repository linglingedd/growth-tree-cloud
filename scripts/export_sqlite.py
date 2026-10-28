"""Export private local growth-tree data as a Supabase SQL import file."""

import argparse
import json
import sqlite3
from pathlib import Path


def literal(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def export(db_path, email, output):
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    notes = db.execute("SELECT id, day, text, ts, src, analyzed FROM notes ORDER BY id").fetchall()
    entries = db.execute(
        "SELECT day, text, branches, warmth, one_line, created_at FROM entries ORDER BY id"
    ).fetchall()
    lines = [
        "begin;",
        "do $$ begin",
        f"  if not exists (select 1 from auth.users where email = {literal(email)}) then",
        "    raise exception 'Target account does not exist';",
        "  end if;",
        "end $$;",
    ]
    user_id = f"(select id from auth.users where email = {literal(email)})"
    for row in notes:
        lines.append(
            "insert into public.growth_notes(user_id, day, text, source, legacy_id, created_at, analyzed) "
            f"values ({user_id}, {literal(row['day'])}, {literal(row['text'])}, "
            f"{literal('legacy:' + (row['src'] or 'local'))}, {row['id']}, to_timestamp({row['ts']}), "
            f"{'true' if row['analyzed'] else 'false'}) on conflict do nothing;"
        )
    for row in entries:
        branches = json.loads(row["branches"])
        lines.append(
            "insert into public.growth_entries(user_id, day, diary, branches, warmth, one_line, created_at) "
            f"values ({user_id}, {literal(row['day'])}, {literal(row['text'])}, "
            f"{literal(json.dumps(branches, ensure_ascii=False))}::jsonb, "
            f"{literal(row['warmth'])}, {literal(row['one_line'])}, "
            f"({literal(row['created_at'])}::timestamp at time zone 'Asia/Shanghai')) "
            "on conflict(user_id, day) do nothing;"
        )
    lines.append("commit;")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Exported {len(notes)} notes and {len(entries)} entries to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    export(args.db, args.email.strip().lower(), args.output)

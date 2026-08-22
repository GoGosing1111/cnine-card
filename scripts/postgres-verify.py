#!/usr/bin/env python3
"""Verify a completed cnine D1 -> Neon PostgreSQL import without mutating data."""

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql


SQLITE_INTERNAL_TABLES = {"sqlite_sequence"}
EXPECTED_APP_TABLES = 210
EXPECTED_BUSINESS_TRIGGERS = 12
EXPECTED_VIEWS = 1
EXPECTED_FOREIGN_KEYS = 7


def unquote_ident(value: str) -> str:
    if len(value) < 2 or value[0] != '"' or value[-1] != '"':
        raise ValueError(f"unsafe manifest identifier: {value!r}")
    return value[1:-1].replace('""', '"')


def scalar(conn, query, params=None):
    return conn.execute(query, params or ()).fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify the imported cnine Neon database")
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    database_url = os.environ.get("CNINE_NEON_DATABASE_URL")
    if not database_url:
        raise SystemExit("CNINE_NEON_DATABASE_URL is required")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    entries = [
        entry
        for entry in manifest["tables"]
        if unquote_ident(entry["table"]) not in SQLITE_INTERNAL_TABLES
    ]
    expected_rows = sum(int(entry["rows"]) for entry in entries)

    mismatches = []
    actual_rows = 0
    with psycopg.connect(database_url, autocommit=True) as conn:
        for ordinal, entry in enumerate(entries, 1):
            table_name = unquote_ident(entry["table"])
            actual = scalar(
                conn,
                sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table_name)),
            )
            expected = int(entry["rows"])
            actual_rows += actual
            if actual != expected:
                mismatches.append({"table": table_name, "expected": expected, "actual": actual})
            if ordinal % 25 == 0 or ordinal == len(entries):
                print(f"row-count {ordinal}/{len(entries)}", flush=True)

        app_tables = scalar(
            conn,
            """
            SELECT count(*)
            FROM pg_catalog.pg_tables
            WHERE schemaname = 'public'
              AND tablename <> 'cnine_migration_control'
            """,
        )
        triggers = scalar(
            conn,
            """
            SELECT count(*)
            FROM pg_catalog.pg_trigger t
            JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND NOT t.tgisinternal
            """,
        )
        views = scalar(
            conn,
            "SELECT count(*) FROM pg_catalog.pg_views WHERE schemaname = 'public'",
        )
        fk_total, fk_validated = conn.execute(
            """
            SELECT count(*), count(*) FILTER (WHERE convalidated)
            FROM pg_catalog.pg_constraint c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public' AND c.contype = 'f'
            """
        ).fetchone()
        completed_copies = scalar(
            conn,
            """
            SELECT count(*)
            FROM cnine_migration_control
            WHERE source_sha256 = %s AND phase = 'copy'
            """,
            (manifest["source_sha256"],),
        )

        checks = {
            "manifest_tables": len(entries),
            "completed_copy_tables": completed_copies,
            "expected_rows": expected_rows,
            "actual_rows": actual_rows,
            "row_count_mismatches": mismatches,
            "app_tables": app_tables,
            "business_triggers": triggers,
            "views": views,
            "foreign_keys": fk_total,
            "validated_foreign_keys": fk_validated,
            "key_counts": {
                "users": scalar(conn, 'SELECT count(*) FROM "users"'),
                "cards": scalar(conn, 'SELECT count(*) FROM "cards"'),
                "user_cards": scalar(conn, 'SELECT count(*) FROM "user_cards"'),
                "coin_logs": scalar(conn, 'SELECT count(*) FROM "coin_logs"'),
                "inventory_logs": scalar(conn, 'SELECT count(*) FROM "inventory_logs"'),
                "pvp_battle_audits_v1781": scalar(
                    conn, 'SELECT count(*) FROM "pvp_battle_audits_v1781"'
                ),
            },
        }

    failures = []
    if mismatches:
        failures.append("table row counts")
    if actual_rows != expected_rows:
        failures.append("total row count")
    if completed_copies != len(entries):
        failures.append("migration control")
    if app_tables != EXPECTED_APP_TABLES:
        failures.append("app table count")
    if triggers != EXPECTED_BUSINESS_TRIGGERS:
        failures.append("business trigger count")
    if views != EXPECTED_VIEWS:
        failures.append("view count")
    if fk_total != EXPECTED_FOREIGN_KEYS or fk_validated != EXPECTED_FOREIGN_KEYS:
        failures.append("foreign key validation")

    print(json.dumps(checks, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit("verification failed: " + ", ".join(failures))
    print("Neon verification PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise

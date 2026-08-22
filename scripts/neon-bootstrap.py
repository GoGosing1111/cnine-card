#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""기존 Neon owner 연결로 전용 cnine DB와 마이그레이션 소유자를 준비한다.

비밀번호/연결 문자열은 환경 변수로만 받고 출력하지 않는다. 기존 DB를 삭제하거나
덮어쓰지 않으며, 동일 이름 DB의 소유자가 다르면 즉시 중단한다.
"""

import argparse
import os
import sys
from urllib.parse import urlsplit, urlunsplit


def main():
    ap = argparse.ArgumentParser(description='Neon cnine 전용 DB bootstrap')
    ap.add_argument('--database', default='cnine')
    ap.add_argument('--role', default='cnine_migrator')
    args = ap.parse_args()

    owner_url = os.environ.get('CNINE_NEON_OWNER_URL')
    password = os.environ.get('CNINE_NEON_MIGRATOR_PASSWORD')
    if not owner_url or not password:
        raise SystemExit('CNINE_NEON_OWNER_URL/CNINE_NEON_MIGRATOR_PASSWORD가 필요합니다.')
    if len(password) < 32:
        raise SystemExit('마이그레이션 비밀번호가 너무 짧습니다.')

    try:
        import psycopg
        from psycopg import sql
    except ImportError as exc:
        raise SystemExit('psycopg[binary]가 필요합니다.') from exc

    with psycopg.connect(owner_url, autocommit=True, connect_timeout=15) as conn:
        current_owner = conn.execute('SELECT current_user').fetchone()[0]
        role = conn.execute(
            'SELECT 1 FROM pg_roles WHERE rolname=%s', (args.role,)
        ).fetchone()
        if role:
            conn.execute(
                sql.SQL('ALTER ROLE {} WITH LOGIN PASSWORD {}').format(
                    sql.Identifier(args.role), sql.Literal(password)
                )
            )
            print(f'role={args.role} password_rotated=true')
        else:
            conn.execute(
                sql.SQL('CREATE ROLE {} WITH LOGIN PASSWORD {}').format(
                    sql.Identifier(args.role), sql.Literal(password)
                )
            )
            print(f'role={args.role} created=true')

        database = conn.execute(
            'SELECT r.rolname AS owner FROM pg_database d '
            'JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=%s',
            (args.database,),
        ).fetchone()
        if database:
            if database[0] not in {args.role, current_owner}:
                raise RuntimeError(
                    f'database={args.database} 기존 소유자={database[0]} '
                    f'(예상 {current_owner} 또는 {args.role}); 자동 변경을 거부합니다.')
            print(f'database={args.database} existing=true owner={database[0]}')
        else:
            conn.execute(
                sql.SQL('CREATE DATABASE {}').format(sql.Identifier(args.database))
            )
            print(f'database={args.database} created=true owner={current_owner}')

        conn.execute(
            sql.SQL('GRANT ALL PRIVILEGES ON DATABASE {} TO {}').format(
                sql.Identifier(args.database), sql.Identifier(args.role)
            )
        )

    parsed = urlsplit(owner_url)
    target_url = urlunsplit((
        parsed.scheme, parsed.netloc, '/' + args.database, parsed.query, parsed.fragment
    ))
    with psycopg.connect(target_url, autocommit=True, connect_timeout=15) as target:
        target.execute(
            sql.SQL('GRANT USAGE, CREATE ON SCHEMA public TO {}').format(
                sql.Identifier(args.role)
            )
        )
    print(f'grants=database,public_schema role={args.role}')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise

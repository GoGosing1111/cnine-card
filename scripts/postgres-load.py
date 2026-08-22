#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""검증된 D1 COPY 산출물을 Neon PostgreSQL에 재개 가능하게 적재한다.

접속 문자열은 명령행 인자로 받지 않는다. 프로세스 목록/셸 기록 노출을 막기 위해
환경 변수 CNINE_NEON_DATABASE_URL만 사용한다. 운영 쓰기는 --yes-production 없이는
시작하지 않는다.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path


def split_postgres_statements(text):
    """따옴표, 주석, dollar quote를 보존해 PostgreSQL 문장을 분리한다."""
    statements = []
    buffer = []
    state = 'plain'
    dollar_tag = None
    index = 0
    length = len(text)

    while index < length:
        ch = text[index]
        nxt = text[index + 1] if index + 1 < length else ''

        if state == 'line-comment':
            buffer.append(ch)
            if ch in '\r\n':
                state = 'plain'
            index += 1
            continue

        if state == 'block-comment':
            buffer.append(ch)
            if ch == '*' and nxt == '/':
                buffer.append(nxt)
                index += 2
                state = 'plain'
            else:
                index += 1
            continue

        if state == 'single':
            buffer.append(ch)
            if ch == "'":
                if nxt == "'":
                    buffer.append(nxt)
                    index += 2
                    continue
                state = 'plain'
            index += 1
            continue

        if state == 'double':
            buffer.append(ch)
            if ch == '"':
                if nxt == '"':
                    buffer.append(nxt)
                    index += 2
                    continue
                state = 'plain'
            index += 1
            continue

        if state == 'dollar':
            if text.startswith(dollar_tag, index):
                buffer.append(dollar_tag)
                index += len(dollar_tag)
                state = 'plain'
            else:
                buffer.append(ch)
                index += 1
            continue

        if ch == '-' and nxt == '-':
            buffer.extend((ch, nxt))
            index += 2
            state = 'line-comment'
            continue
        if ch == '/' and nxt == '*':
            buffer.extend((ch, nxt))
            index += 2
            state = 'block-comment'
            continue
        if ch == "'":
            buffer.append(ch)
            index += 1
            state = 'single'
            continue
        if ch == '"':
            buffer.append(ch)
            index += 1
            state = 'double'
            continue
        if ch == '$':
            match = re.match(r'\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$', text[index:])
            if match:
                dollar_tag = match.group(0)
                buffer.append(dollar_tag)
                index += len(dollar_tag)
                state = 'dollar'
                continue
        if ch == ';':
            statement = ''.join(buffer).strip()
            if statement:
                statements.append(statement)
            buffer = []
            index += 1
            continue
        buffer.append(ch)
        index += 1

    if state in {'single', 'double', 'dollar', 'block-comment'}:
        raise ValueError(f'닫히지 않은 PostgreSQL 구문 상태: {state}')
    statement = ''.join(buffer).strip()
    if statement:
        statements.append(statement)
    return statements


def read_sql_file(path):
    text = Path(path).read_text(encoding='utf-8')
    text = re.sub(r'^\\set\s+.*$', '', text, flags=re.M)
    return split_postgres_statements(text)


def unquote_ident(value):
    if not isinstance(value, str) or len(value) < 2 or value[0] != '"' or value[-1] != '"':
        raise ValueError(f'안전하지 않은 manifest 식별자: {value!r}')
    return value[1:-1].replace('""', '"')


SQLITE_INTERNAL_TABLES = {'sqlite_sequence'}


def validate_local(manifest_path, copy_dir):
    manifest_path = Path(manifest_path).resolve()
    copy_dir = Path(copy_dir).resolve()
    payload = json.loads(manifest_path.read_text(encoding='utf-8'))
    if payload.get('format') != 'postgres-copy-text-v1':
        raise ValueError('지원하지 않는 COPY manifest 형식')
    if payload.get('table_count') != len(payload.get('tables', [])):
        raise ValueError('manifest table_count 불일치')
    seen_files = set()
    for entry in payload['tables']:
        unquote_ident(entry['table'])
        for column in entry['columns']:
            unquote_ident(column)
        file_name = entry['file']
        if file_name in seen_files or Path(file_name).name != file_name:
            raise ValueError(f'중복/비정상 COPY 파일명: {file_name}')
        seen_files.add(file_name)
        file_path = (copy_dir / file_name).resolve()
        if file_path.parent != copy_dir or not file_path.is_file():
            raise ValueError(f'COPY 파일 누락: {file_path}')
    if len(seen_files) != len(list(copy_dir.glob('*.copy'))):
        raise ValueError('manifest와 COPY 디렉터리 파일 개수가 다름')
    if sum(int(entry['rows']) for entry in payload['tables']) != int(payload['total_rows']):
        raise ValueError('manifest 전체 행 수 불일치')
    return payload, copy_dir


def execute_sql_file(conn, path, phase):
    statements = read_sql_file(path)
    try:
        for ordinal, statement in enumerate(statements, 1):
            conn.execute(statement, prepare=False)
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        raise RuntimeError(f'{phase} SQL {ordinal}/{len(statements)} 실패: {exc}') from exc
    return len(statements)


def ensure_control_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cnine_migration_control (
          source_sha256 text NOT NULL,
          phase text NOT NULL,
          object_name text NOT NULL,
          row_count bigint,
          completed_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(source_sha256, phase, object_name)
        )
    """)


def phase_done(conn, source_sha256, phase, object_name='*'):
    row = conn.execute(
        'SELECT 1 FROM cnine_migration_control '
        'WHERE source_sha256=%s AND phase=%s AND object_name=%s',
        (source_sha256, phase, object_name),
    ).fetchone()
    return bool(row)


def mark_done(conn, source_sha256, phase, object_name='*', row_count=None):
    conn.execute(
        'INSERT INTO cnine_migration_control '
        '(source_sha256,phase,object_name,row_count) VALUES(%s,%s,%s,%s) '
        'ON CONFLICT(source_sha256,phase,object_name) DO UPDATE SET '
        'row_count=excluded.row_count,completed_at=now()',
        (source_sha256, phase, object_name, row_count),
    )


def copy_tables(conn, pg_sql, payload, copy_dir):
    source_sha256 = payload['source_sha256']
    total_tables = len(payload['tables'])
    for ordinal, entry in enumerate(payload['tables'], 1):
        table_name = unquote_ident(entry['table'])
        if table_name in SQLITE_INTERNAL_TABLES:
            print(
                f'COPY {ordinal}/{total_tables} {table_name}: SQLite 내부 메타 테이블, 제외',
                flush=True,
            )
            continue
        if phase_done(conn, source_sha256, 'copy', table_name):
            print(f'COPY {ordinal}/{total_tables} {table_name}: 이미 완료, 건너뜀', flush=True)
            continue

        columns = [unquote_ident(value) for value in entry['columns']]
        count_query = pg_sql.SQL('SELECT count(*) FROM {}').format(pg_sql.Identifier(table_name))
        existing = conn.execute(count_query).fetchone()[0]
        if existing:
            raise RuntimeError(
                f'{table_name}: migration 완료 기록은 없지만 대상에 {existing:,}행이 있음. '
                '자동 덮어쓰기를 거부합니다.')

        copy_query = pg_sql.SQL(
            "COPY {} ({}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')"
        ).format(
            pg_sql.Identifier(table_name),
            pg_sql.SQL(',').join(pg_sql.Identifier(column) for column in columns),
        )
        file_path = copy_dir / entry['file']
        with conn.transaction():
            with conn.cursor() as cursor:
                with cursor.copy(copy_query) as copy:
                    with file_path.open('rb') as source:
                        while chunk := source.read(8 * 1024 * 1024):
                            copy.write(chunk)
            actual = conn.execute(count_query).fetchone()[0]
            expected = int(entry['rows'])
            if actual != expected:
                raise RuntimeError(f'{table_name}: COPY 후 {actual:,}행, 예상 {expected:,}행')
            mark_done(conn, source_sha256, 'copy', table_name, actual)
        print(f'COPY {ordinal}/{total_tables} {table_name}: {actual:,}행 완료', flush=True)


def main():
    ap = argparse.ArgumentParser(description='D1 COPY 산출물을 Neon PostgreSQL에 적재')
    ap.add_argument('--schema', required=True)
    ap.add_argument('--copy-dir', required=True)
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--post-data', required=True)
    ap.add_argument('--business-objects', required=True)
    ap.add_argument('--fk-validate', required=True)
    ap.add_argument('--dry-run', action='store_true', help='로컬 산출물/SQL 파싱만 검증')
    ap.add_argument('--yes-production', action='store_true', help='실제 DB 쓰기 명시 승인')
    args = ap.parse_args()

    payload, copy_dir = validate_local(args.manifest, args.copy_dir)
    sql_files = {
        'schema': args.schema,
        'post-data': args.post_data,
        'business': args.business_objects,
        'fk-validate': args.fk_validate,
    }
    parsed = {name: len(read_sql_file(path)) for name, path in sql_files.items()}
    print(json.dumps({
        'source_sha256': payload['source_sha256'],
        'tables': payload['table_count'],
        'rows': payload['total_rows'],
        'sql_statements': parsed,
    }, ensure_ascii=False, indent=2))
    if args.dry_run:
        print('DRY RUN PASS: PostgreSQL에는 연결하지 않았습니다.')
        return
    if not args.yes_production:
        raise SystemExit('실제 적재에는 --yes-production이 필요합니다.')

    database_url = os.environ.get('CNINE_NEON_DATABASE_URL')
    if not database_url:
        raise SystemExit('CNINE_NEON_DATABASE_URL 환경 변수가 없습니다.')
    try:
        import psycopg
        from psycopg import sql as pg_sql
    except ImportError as exc:
        raise SystemExit('python -m pip install "psycopg[binary]" 를 먼저 실행하세요.') from exc

    with psycopg.connect(database_url, autocommit=True, connect_timeout=15) as conn:
        conn.execute("SET statement_timeout TO 0")
        conn.execute("SET lock_timeout TO '30s'")
        conn.execute("SET TIME ZONE 'UTC'")
        source_sha256 = payload['source_sha256']

        # 제어 테이블은 대상이 비어 있어도 먼저 만들 수 있고, 업무 스키마와 충돌하지 않는다.
        ensure_control_table(conn)
        if not phase_done(conn, source_sha256, 'schema'):
            count = execute_sql_file(conn, args.schema, 'schema')
            mark_done(conn, source_sha256, 'schema', row_count=count)
        else:
            print('schema: 이미 완료, 건너뜀')

        copy_tables(conn, pg_sql, payload, copy_dir)

        for phase, path in (
            ('post-data', args.post_data),
            ('business', args.business_objects),
            ('fk-validate', args.fk_validate),
        ):
            if phase_done(conn, source_sha256, phase):
                print(f'{phase}: 이미 완료, 건너뜀')
                continue
            count = execute_sql_file(conn, path, phase)
            mark_done(conn, source_sha256, phase, row_count=count)
            print(f'{phase}: SQL {count}개 완료')

        conn.execute('ANALYZE')
        mark_done(conn, source_sha256, 'analyze')
        print('Neon 적재·FK 검증·ANALYZE 완료')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D1 export의 단일행 INSERT를 PostgreSQL COPY text 파일로 스트리밍 변환한다.

전체 덤프를 메모리에 올리지 않는다. D1 export가 테이블별로 정렬되어 있고 모든
INSERT에 명시적 컬럼 목록이 있다는 조건을 검증하며, 조건이 어긋나면 즉시 실패한다.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

INSERT_RE = re.compile(
    r'^INSERT\s+INTO\s+(?P<table>"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|[^\s(]+)\s*'
    r'\((?P<columns>[^)]*)\)\s*VALUES\s*\((?P<values>.*)\);\s*$', re.I | re.S)
NUMBER_RE = re.compile(r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$')
BLOB_RE = re.compile(r"^X'([0-9A-Fa-f]*)'$", re.S)
CHAR_RE = re.compile(r'^char\s*\((?P<args>.*)\)$', re.I | re.S)
REPLACE_RE = re.compile(r'^replace\s*\((?P<args>.*)\)$', re.I | re.S)


def unquote_ident(value):
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('""', '"')
    if value.startswith('`') and value.endswith('`'):
        return value[1:-1]
    if value.startswith('[') and value.endswith(']'):
        return value[1:-1]
    return value


def quote_ident(value):
    return '"' + unquote_ident(value).replace('"', '""') + '"'


def split_values(body):
    values, buf, quote, depth = [], [], False, 0
    i = 0
    while i < len(body):
        ch = body[i]
        if quote:
            buf.append(ch)
            if ch == "'":
                if i + 1 < len(body) and body[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                quote = False
            i += 1
            continue
        if ch == "'":
            quote = True
            buf.append(ch)
        elif ch == '(':
            depth += 1
            buf.append(ch)
        elif ch == ')':
            depth -= 1
            buf.append(ch)
        elif ch == ',' and depth == 0:
            values.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    if quote or depth != 0:
        raise ValueError('닫히지 않은 문자열 또는 괄호')
    values.append(''.join(buf).strip())
    return values


def parse_sqlite_text_expression(value):
    """D1 export가 단일 행을 유지하려고 만든 안전한 TEXT 표현식을 평가한다.

    Wrangler는 실제 개행이 든 문자열을
    `replace('문자\\n열','\\n',char(10))` 형태로 내보낸다. 임의 SQL을 실행하지
    않고 문자열 리터럴, char(), replace()만 재귀적으로 해석한다.
    """
    raw = value.strip()
    if len(raw) >= 2 and raw[0] == "'" and raw[-1] == "'":
        return raw[1:-1].replace("''", "'")

    char_match = CHAR_RE.fullmatch(raw)
    if char_match:
        args = split_values(char_match.group('args'))
        chars = []
        for arg in args:
            number = arg.strip()
            if not re.fullmatch(r'[+-]?\d+', number):
                raise ValueError(f'char()에 정수가 아닌 인자: {number[:80]}')
            codepoint = int(number)
            if not 0 <= codepoint <= 0x10FFFF:
                raise ValueError(f'char() 코드포인트 범위 초과: {codepoint}')
            chars.append(chr(codepoint))
        return ''.join(chars)

    replace_match = REPLACE_RE.fullmatch(raw)
    if replace_match:
        args = split_values(replace_match.group('args'))
        if len(args) != 3:
            raise ValueError(f'replace() 인자 수 {len(args)}개')
        source, old, new = (parse_sqlite_text_expression(arg) for arg in args)
        return source.replace(old, new)

    raise ValueError(f'지원하지 않는 SQLite TEXT 표현식: {raw[:120]}')


def escape_copy_text(text):
    if '\x00' in text:
        raise ValueError('PostgreSQL text에 넣을 수 없는 NUL 문자')
    return (text.replace('\\', r'\\')
                .replace('\t', r'\t')
                .replace('\n', r'\n')
                .replace('\r', r'\r'))


def copy_escape(value):
    raw = value.strip()
    if raw.upper() == 'NULL':
        return r'\N'
    if NUMBER_RE.fullmatch(raw):
        return raw
    blob = BLOB_RE.fullmatch(raw)
    if blob:
        return r'\\x' + blob.group(1)
    try:
        return escape_copy_text(parse_sqlite_text_expression(raw))
    except ValueError as exc:
        if str(exc).startswith('지원하지 않는 SQLite TEXT 표현식:'):
            raise ValueError(f'지원하지 않는 SQLite 값: {raw[:120]}') from exc
        raise


def safe_file_name(table):
    return re.sub(r'[^A-Za-z0-9_.-]+', '_', unquote_ident(table)) + '.copy'


SQLITE_INTERNAL_TABLES = {'sqlite_sequence'}


def main():
    ap = argparse.ArgumentParser(description='D1 INSERT를 테이블별 PostgreSQL COPY text로 변환')
    ap.add_argument('input')
    ap.add_argument('--copy-dir', required=True)
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--progress-every', type=int, default=500000)
    args = ap.parse_args()

    source = Path(args.input)
    copy_dir = Path(args.copy_dir)
    manifest_path = Path(args.manifest)
    if copy_dir.exists() and any(copy_dir.iterdir()):
        raise SystemExit(f'출력 폴더가 비어 있지 않습니다: {copy_dir}')
    copy_dir.mkdir(parents=True, exist_ok=True)
    if manifest_path.exists():
        raise SystemExit(f'manifest가 이미 있습니다: {manifest_path}')

    tables = []
    by_name = {}
    current = None
    out = None
    rows = 0
    digest = hashlib.sha256()

    try:
        with source.open('rb') as raw:
            for line_no, raw_line in enumerate(raw, 1):
                digest.update(raw_line)
                if not raw_line.startswith(b'INSERT INTO '):
                    continue
                try:
                    line = raw_line.decode('utf-8').rstrip('\r\n')
                except UnicodeDecodeError as exc:
                    raise RuntimeError(f'{line_no}행 UTF-8 오류: {exc}') from exc
                match = INSERT_RE.match(line)
                if not match:
                    raise RuntimeError(f'{line_no}행 INSERT 형식 불일치')
                table = quote_ident(match.group('table'))
                if unquote_ident(table) in SQLITE_INTERNAL_TABLES:
                    continue
                columns = [quote_ident(x) for x in match.group('columns').split(',')]
                values = split_values(match.group('values'))
                if len(values) != len(columns):
                    raise RuntimeError(
                        f'{line_no}행 {table}: 컬럼 {len(columns)}개 / 값 {len(values)}개')

                if current != table:
                    if table in by_name:
                        raise RuntimeError(f'{line_no}행: 테이블 {table} 데이터가 비연속적으로 재등장')
                    if out:
                        out.close()
                    entry = {
                        'table': table,
                        'columns': columns,
                        'file': safe_file_name(table),
                        'rows': 0,
                    }
                    tables.append(entry)
                    by_name[table] = entry
                    current = table
                    out = (copy_dir / entry['file']).open('w', encoding='utf-8', newline='\n')
                elif columns != by_name[table]['columns']:
                    raise RuntimeError(f'{line_no}행 {table}: COPY 도중 컬럼 목록 변경')

                try:
                    out.write('\t'.join(copy_escape(v) for v in values) + '\n')
                except ValueError as exc:
                    raise RuntimeError(f'{line_no}행 {table}: {exc}') from exc
                by_name[table]['rows'] += 1
                rows += 1
                if args.progress_every and rows % args.progress_every == 0:
                    print(f'{rows:,}행 변환 · 현재 {table}', flush=True)
    finally:
        if out:
            out.close()

    payload = {
        'format': 'postgres-copy-text-v1',
        'source': str(source),
        'source_sha256': digest.hexdigest(),
        'total_rows': rows,
        'table_count': len(tables),
        'tables': tables,
    }
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({
        'table_count': len(tables),
        'total_rows': rows,
        'source_sha256': payload['source_sha256'],
        'manifest': str(manifest_path),
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise

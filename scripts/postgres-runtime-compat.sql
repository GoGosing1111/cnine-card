BEGIN;

-- Runtime compatibility helpers used while the existing D1 query surface is
-- migrated endpoint-by-endpoint. Timestamps remain UTC TEXT by design.
CREATE OR REPLACE FUNCTION sqlite_datetime(VARIADIC args text[])
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  source text;
  modifier text;
  value_ts timestamp without time zone;
BEGIN
  IF args IS NULL OR array_length(args, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  source := NULLIF(btrim(args[1]), '');
  IF source IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    IF lower(source) = 'now' THEN
      value_ts := now() AT TIME ZONE 'UTC';
    ELSIF source ~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' THEN
      value_ts := source::timestamptz AT TIME ZONE 'UTC';
    ELSE
      value_ts := replace(substr(source, 1, 19), 'T', ' ')::timestamp;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF array_length(args, 1) > 1 THEN
    FOREACH modifier IN ARRAY args[2:array_length(args, 1)] LOOP
      modifier := lower(btrim(COALESCE(modifier, '')));
      IF modifier = '' THEN
        CONTINUE;
      ELSIF modifier = 'start of day' THEN
        value_ts := date_trunc('day', value_ts);
      ELSIF modifier = 'start of month' THEN
        value_ts := date_trunc('month', value_ts);
      ELSIF modifier = 'start of year' THEN
        value_ts := date_trunc('year', value_ts);
      ELSIF modifier IN ('utc', 'localtime') THEN
        CONTINUE;
      ELSE
        BEGIN
          value_ts := value_ts + modifier::interval;
        EXCEPTION WHEN OTHERS THEN
          RETURN NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN to_char(value_ts, 'YYYY-MM-DD HH24:MI:SS');
END;
$$;

CREATE OR REPLACE FUNCTION sqlite_date(VARIADIC args text[])
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT substr(sqlite_datetime(VARIADIC args), 1, 10)
$$;

CREATE OR REPLACE FUNCTION sqlite_time(VARIADIC args text[])
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT substr(sqlite_datetime(VARIADIC args), 12, 8)
$$;

CREATE OR REPLACE FUNCTION sqlite_julianday(value text)
RETURNS double precision
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  normalized text;
  value_ts timestamp without time zone;
BEGIN
  normalized := sqlite_datetime(value);
  IF normalized IS NULL THEN
    RETURN NULL;
  END IF;
  value_ts := normalized::timestamp;
  RETURN extract(epoch FROM value_ts) / 86400.0 + 2440587.5;
END;
$$;

CREATE OR REPLACE FUNCTION sqlite_json_valid(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  PERFORM value::jsonb;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION sqlite_json_array_length(value text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN jsonb_array_length(value::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sqlite_json_extract(value text, path text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key text;
BEGIN
  IF path ~ '^\$\.[A-Za-z0-9_]+$' THEN
    key := substr(path, 3);
  ELSIF path ~ '^\$\[[0-9]+\]$' THEN
    key := substring(path FROM '[0-9]+');
  ELSE
    RETURN NULL;
  END IF;
  RETURN jsonb_extract_path_text(value::jsonb, key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sqlite_json_each(input_value text)
RETURNS TABLE(value text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT element #>> '{}'
    FROM jsonb_array_elements(COALESCE(input_value, '[]')::jsonb) AS element;
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

-- SQLite accepts round(double, precision); PostgreSQL only provides the
-- two-argument overload for numeric.
CREATE OR REPLACE FUNCTION public.round(value double precision, digits integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT pg_catalog.round(value::numeric, digits)
$$;

COMMIT;

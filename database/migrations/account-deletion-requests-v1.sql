CREATE TABLE IF NOT EXISTS account_deletion_requests_v1 (
    receipt_hash TEXT PRIMARY KEY CHECK (length(receipt_hash) = 64),
    user_id BIGINT UNIQUE,
    receipt TEXT,
    phase TEXT NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CHECK (
        (phase = 'pending' AND user_id IS NOT NULL AND receipt IS NOT NULL AND retired_at IS NULL AND completed_at IS NULL) OR
        (phase = 'retiring' AND user_id IS NOT NULL AND receipt IS NULL AND retired_at IS NOT NULL AND completed_at IS NULL) OR
        (phase = 'completed' AND user_id IS NULL AND receipt IS NULL AND retired_at IS NULL AND completed_at IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS account_deletion_work_v1 ON account_deletion_requests_v1 (phase, retired_at, requested_at);
CREATE INDEX IF NOT EXISTS account_deletion_expiry_v1 ON account_deletion_requests_v1 (completed_at) WHERE phase = 'completed';

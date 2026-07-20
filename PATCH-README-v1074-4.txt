CNINE CARD V1074-4 WAGO EXTENSION RECEIPT TABLE SELF-HEAL HOTFIX

- Fixes: D1_ERROR no such table wago_extension_reward_receipts
- Before grant/recent API use, safely executes CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
- Restores the app_meta upgrade marker only after the table/indexes exist.
- No DROP TABLE, RENAME TABLE, table recreation, column deletion, or existing-data deletion.
- Only modified file included: functions/api/[[path]].js

-- v1023 Inventory foundation: additive only. Existing tables and data are untouched.
CREATE TABLE IF NOT EXISTS inventory_items (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'PACK',
  rarity TEXT NOT NULL DEFAULT 'SPECIAL',
  image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_inventory (
  user_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unseen_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,item_code)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  change_amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  reference_type TEXT,
  reference_id TEXT,
  admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_use_receipts (
  request_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  response_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(user_id,quantity);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_user ON inventory_logs(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_user ON inventory_use_receipts(user_id,created_at);

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('GUARANTEED_LIMITED_PACK','확정 리미티드팩','LIMITED SIGNATURE PACK','서버 한정판 카드 중 1장을 확정 획득합니다.','PACK','LIMITED','assets/ui/packs/limited-pack.png',10,1);

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('GUARANTEED_MA_PACK','확정 MA팩','MASTER ARCHIVE PACK','MA 등급 카드 중 1장을 확정 획득합니다.','PACK','MA','assets/ui/packs/guaranteed-ma-pack.png',20,1);

INSERT OR IGNORE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1023_inventory','1',CURRENT_TIMESTAMP);

// Explicit installation only. Runtime reads never run DDL or import clan data.
export const ORGANIZATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS organization_policy_v1(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,policy_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS organization_rounds_v1(id TEXT PRIMARY KEY,scope TEXT NOT NULL CHECK(scope IN('TEST','LIVE')),name TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN('PREPARATION','SURVEY','CLOSED','ASSIGNED')),revision INTEGER NOT NULL DEFAULT 0,created_at BIGINT NOT NULL,assigned_at BIGINT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organization_one_round_v1 ON organization_rounds_v1(scope)`,
  `CREATE TABLE IF NOT EXISTS organization_surveys_v1(round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),user_id BIGINT NOT NULL REFERENCES users(id),preferred_id INTEGER NOT NULL CHECK(preferred_id BETWEEN 1 AND 15),revision INTEGER NOT NULL DEFAULT 1,updated_at BIGINT NOT NULL,answers_json TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),PRIMARY KEY(round_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS organization_ratings_v1(round_id TEXT NOT NULL,user_id BIGINT NOT NULL,round_revision INTEGER NOT NULL,rating_json TEXT NOT NULL,expires_at BIGINT NOT NULL,PRIMARY KEY(round_id,user_id),FOREIGN KEY(round_id,user_id) REFERENCES organization_surveys_v1(round_id,user_id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS organization_proposals_v1(id TEXT PRIMARY KEY,round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),round_revision INTEGER NOT NULL,input_hash TEXT NOT NULL,result_json TEXT NOT NULL,expires_at BIGINT NOT NULL,created_at BIGINT NOT NULL,applied_at BIGINT)`,
  `CREATE INDEX IF NOT EXISTS organization_proposals_round_v1 ON organization_proposals_v1(round_id,created_at DESC,id)`,
  `CREATE TABLE IF NOT EXISTS organization_members_v1(round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),user_id BIGINT NOT NULL REFERENCES users(id),organization_id INTEGER NOT NULL CHECK(organization_id BETWEEN 1 AND 15),slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 10),seed_power BIGINT NOT NULL CHECK(seed_power>0),joined_at BIGINT NOT NULL,PRIMARY KEY(round_id,user_id),UNIQUE(round_id,organization_id,slot))`,
  `CREATE TABLE IF NOT EXISTS organization_progress_v1(round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),organization_id INTEGER NOT NULL CHECK(organization_id BETWEEN 1 AND 15),points BIGINT NOT NULL DEFAULT 0 CHECK(points>=0),stage INTEGER NOT NULL DEFAULT 1 CHECK(stage BETWEEN 1 AND 5),PRIMARY KEY(round_id,organization_id))`,
  `CREATE TABLE IF NOT EXISTS organization_actors_v1(user_id BIGINT PRIMARY KEY REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS organization_receipts_v1(actor_id BIGINT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,response_json TEXT NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(actor_id,request_id))`
];
export async function installOrganizationSchema(DB){
  if(DB.dialect!=='postgres'||!DB.execSchema)throw Error('Organization preparation requires PostgreSQL');
  await DB.execSchema(ORGANIZATION_SCHEMA);
  const {defaultOrganizationPolicy}=await import('../shared/organization-system-v1.mjs');
  await DB.prepare('INSERT INTO organization_policy_v1(id,policy_json) VALUES(1,?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(defaultOrganizationPolicy())).run();
}

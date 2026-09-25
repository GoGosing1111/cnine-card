import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

export async function auctionFixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER);
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    INSERT INTO users VALUES(1,'입찰자',1000000000000);
  `);
  const faults = {sql: ''};
  const execute = (statement, method) => {
    if (faults.sql && statement.sql.includes(faults.sql)) throw Error('injected transaction failure');
    const prepared = sql.prepare(statement.sql);
    const result = prepared[method](...statement.values);
    return method === 'run' ? {meta: {changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid)}} : result;
  };
  const DB = {
    prepare(text) {
      return {sql: text, values: [], bind(...values) {this.values = values; return this;},
        async first() {return execute(this, 'get') || null;},
        async all() {return {results: execute(this, 'all')};},
        async run() {return execute(this, 'run');}};
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const result = statements.map(statement => /^\s*SELECT/i.test(statement.sql)
          ? {results: execute(statement, 'all')} : execute(statement, 'run'));
        sql.exec('COMMIT'); return result;
      } catch (error) {sql.exec('ROLLBACK'); throw error;}
    }
  };
  const {handleAuction} = await import(new URL('../../functions/_auction.js?test=' + randomUUID(), import.meta.url));
  const env = {DB};
  const request = async (path, body, userId = 1) => {
    const user = sql.prepare('SELECT * FROM users WHERE id=?').get(userId);
    return handleAuction({path: path.split('?')[0], env,
      request: new Request('https://auction.test/api/' + path, body === undefined ? {} : {method: 'POST', body: JSON.stringify(body)}),
      deps: {authenticate: async () => user, readBody: request => request.json(),
        json: (body, status = 200) => ({body, status}), isAdminRole: () => true}});
  };
  await request('auction/state');
  sql.exec(`INSERT INTO auctions_v1553(id,title,item_type,item_name,starts_at,ends_at,status,min_increment)
    VALUES(1,'검수 경매','MASTER_STAR','마스터의 별',datetime('now','-1 hour'),datetime('now','+1 day'),'ACTIVE',1);
    INSERT INTO auction_bgm_rules_v1554(auction_id,min_bid,max_bid,bgm_url,bgm_duration)
    VALUES(0,1000,10000,'/assets/audio/auction-test.mp3',40);`);
  return {sql, env, faults, request,
    row: text => sql.prepare(text).get(),
    bid: (amount, requestId = randomUUID()) => request('auction/bid', {auctionId: 1, amount, requestId}),
    event: requestId => request('auction/bid-event', {requestId, message: '입찰 검수'})};
}

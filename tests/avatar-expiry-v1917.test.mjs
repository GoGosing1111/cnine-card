import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { grantAvatarOwnership } from '../functions/_avatar.js';

test('temporary avatar grants persist a normalized expiry and use an idempotent upsert', async () => {
  const prepared=[];
  const db={
    dialect:'postgres',
    async execSchema(){},
    prepare(sql){
      const statement={
        sql:String(sql),values:[],bind(...values){this.values=values;return this},
        async first(){return this.sql.includes('SELECT value FROM app_meta')?{value:'1'}:null},
        async run(){return{meta:{changes:1}}},
        async all(){return{results:[]}}
      };
      prepared.push(statement);return statement;
    },
    async batch(statements){return statements.map(()=>({meta:{changes:1},results:[]}))}
  };
  const result=await grantAvatarOwnership({DB:db},{
    userId:216,
    avatarCode:'AMBER_DUNE_CAPTAIN',
    sourceType:'TERRITORY_WAR_RANK',
    sourceRef:'round:35:attacks:147',
    expiresAt:'2026-09-12T10:15:30.000Z'
  });
  const grant=prepared.find(statement=>statement.sql.includes('INSERT INTO avatar_user_ownership_v1'));
  assert.ok(grant);
  assert.match(grant.sql,/source_ref,expires_at/);
  assert.match(grant.sql,/ON CONFLICT\(user_id,avatar_code\) DO UPDATE/);
  assert.match(grant.sql,/avatar_user_ownership_v1\.expires_at IS NOT NULL/);
  assert.equal(grant.values[4],'2026-09-12 10:15:30');
  assert.deepEqual(result,{granted:true,avatarCode:'AMBER_DUNE_CAPTAIN',expiresAt:'2026-09-12 10:15:30'});
});

test('expired avatar ownership is excluded from catalog, equip, effects, and chief portraits', async () => {
  const [avatar,chief]=await Promise.all([
    readFile(new URL('../functions/_avatar.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/_chief.js',import.meta.url),'utf8')
  ]);
  assert.match(avatar,/safe_runtime_upgrade_v1917_avatar_ownership_expiry_v1/);
  assert.match(avatar,/LEFT JOIN avatar_user_ownership_v1 o[\s\S]{0,160}o\.expires_at IS NULL OR o\.expires_at>CURRENT_TIMESTAMP/);
  assert.match(avatar,/JOIN avatar_user_ownership_v1 o[\s\S]{0,180}o\.expires_at IS NULL OR o\.expires_at>CURRENT_TIMESTAMP/);
  assert.match(avatar,/expiresAt:row\.expires_at\|\|null/);
  assert.match(chief,/vo\.expires_at IS NULL OR vo\.expires_at>CURRENT_TIMESTAMP/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  GAMST_RETIREMENT_SOURCE_CARD_IDS,
  buildGamstRetirementPlan,
  ensureGamstCardRetirement,
  rewriteRetiredCardIds
} from '../functions/_gamst_card_retirement.js';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';

const root=path.resolve(import.meta.dirname,'..');
const read=relative=>readFileSync(path.join(root,relative),'utf8');
const [ATTACK_SOURCE,HP_SOURCE]=GAMST_RETIREMENT_SOURCE_CARD_IDS;
const sources=[
  {id:ATTACK_SOURCE,title:'조폭 감스트',powerType:'ATTACK',attackPercent:30},
  {id:HP_SOURCE,title:'훈훈한 감스트',powerType:'HP',hpPercent:30}
];
const candidates=[
  {id:'FUR-ATTACK-A',title:'공격 대체 A',attackPercent:40},
  {id:'FUR-ATTACK-B',title:'공격 대체 B',attackPercent:35},
  {id:'FUR-HP-A',title:'생명 대체 A',hpPercent:45}
];
const refundByLevel=Array.from({length:14},(_,level)=>level*100);

test('+13 보유분은 같은 고유속성 FUR +13으로 바뀌고 전직 이전 여부가 보존된다',()=>{
  const plan=buildGamstRetirementPlan({
    sources,candidates,refundByLevel,
    holders:[
      {userId:7,cardId:ATTACK_SOURCE,quantity:2,breakthroughLevel:13},
      {userId:7,cardId:HP_SOURCE,quantity:1,breakthroughLevel:13}
    ],
    ownedCandidates:[{userId:7,cardId:'FUR-ATTACK-A'}],
    advancements:[{userId:7,cardId:ATTACK_SOURCE}]
  });
  assert.equal(plan.length,2);
  const attack=plan.find(row=>row.sourceCardId===ATTACK_SOURCE);
  const hp=plan.find(row=>row.sourceCardId===HP_SOURCE);
  assert.equal(attack.compensationType,'TRANSFER');
  assert.equal(attack.dominantType,'ATTACK');
  assert.equal(attack.targetCardId,'FUR-ATTACK-B','이미 보유한 후보보다 미보유 후보를 우선해야 한다');
  assert.equal(attack.sourceQuantity,2);
  assert.equal(attack.transferredAdvancement,1);
  assert.equal(hp.compensationType,'TRANSFER');
  assert.equal(hp.dominantType,'HP');
  assert.equal(hp.targetCardId,'FUR-HP-A');
  assert.equal(hp.transferredAdvancement,0);
});

test('+12 이하는 기존 FUR 퇴사 정책의 누적 조각과 카드별 재뽑기권 대상이 된다',()=>{
  const plan=buildGamstRetirementPlan({
    sources,candidates,refundByLevel,
    holders:[
      {userId:8,cardId:ATTACK_SOURCE,quantity:4,breakthroughLevel:12},
      {userId:8,cardId:HP_SOURCE,quantity:1,breakthroughLevel:0}
    ]
  });
  assert.deepEqual(plan.map(row=>row.compensationType),['STANDARD','STANDARD']);
  assert.equal(plan[0].refundShards,1200);
  assert.equal(plan[1].refundShards,0);
  assert.equal(plan.filter(row=>row.compensationType==='STANDARD').length,2,'기존 정책처럼 보유 카드 종류별 재뽑기권 1장씩 지급해야 한다');
});

test('같은 속성의 활성 FUR 후보가 없으면 원본 삭제 전에 전체 정산을 중단한다',()=>{
  assert.throws(()=>buildGamstRetirementPlan({
    sources,candidates:candidates.filter(card=>!card.hpPercent),refundByLevel,
    holders:[{userId:9,cardId:HP_SOURCE,quantity:1,breakthroughLevel:13}]
  }),/같은 HP 속성의 활성 FUR 대체 카드가 없습니다/);
});

test('저장 덱은 +13 이전 카드는 치환하고 일반 보상 카드는 제거하며 중복을 만들지 않는다',()=>{
  const plan=[
    {userId:10,sourceCardId:ATTACK_SOURCE,targetCardId:'FUR-ATTACK-A'},
    {userId:10,sourceCardId:HP_SOURCE,targetCardId:null}
  ];
  assert.deepEqual(
    rewriteRetiredCardIds(['SAFE-1',ATTACK_SOURCE,'SAFE-2',HP_SOURCE,'FUR-ATTACK-A'],10,plan),
    ['SAFE-1','FUR-ATTACK-A','SAFE-2']
  );
});

test('라이브 연결은 원자 정산·검증 후 카드와 전투 SD를 게임 노출에서 제거한다',()=>{
  const api=read('functions/api/[[path]].js');
  const migration=read('functions/_gamst_card_retirement.js');
  const manifestV1=read('assets/ui/project-v/characters/fur/manifest-v1.json');
  const manifestV2=read('assets/ui/project-v/characters/fur/manifest-v2.json');
  assert.match(api,/ensureGamstCardRetirement\(env,\{refundByLevel:await furRetirementRefundByLevel\(env\)\}\)/);
  assert.match(migration,/env\.DB\.batch\(statements\)/);
  assert.match(migration,/CHECK\(verified=1\)/);
  assert.match(migration,/card_status='RETIRED'/);
  assert.match(migration,/DELETE FROM user_cards/);
  assert.match(migration,/DELETE FROM card_pack_cards/);
  assert.match(migration,/m\.name<>'감스트' AND c\.title NOT LIKE '%감스트%'/);
  for(const id of GAMST_RETIREMENT_SOURCE_CARD_IDS){
    assert.doesNotMatch(manifestV1,new RegExp(id));
    assert.doesNotMatch(manifestV2,new RegExp(id));
  }
});

test('정산 SQL의 모든 바인딩 개수는 PostgreSQL 호환 계층 계약과 일치한다',async()=>{
  const discoveredSources=[...sources,{id:'FUR-LEGACY-GAMST',title:'과거 감스트 카드',powerType:'DEFENSE',defensePercent:25}];
  class Statement{
    constructor(db,source,values=[]){this.db=db;this.source=source;this.values=values}
    bind(...values){
      const expected=__postgresCompatTest.bindQuestionMarks(this.source).count;
      assert.equal(values.length,expected,`SQL 바인딩 불일치: ${this.source.slice(0,120)}`);
      return new Statement(this.db,this.source,values);
    }
    first(){return this.db.first(this)}
    all(){return this.db.all(this)}
    run(){return this.db.run(this)}
  }
  class FakeDb{
    constructor(){this.dialect='d1';this.meta=new Map()}
    prepare(source){return new Statement(this,source)}
    async first(statement){
      if(/SELECT value FROM app_meta WHERE key=\?/.test(statement.source)){
        const value=this.meta.get(String(statement.values[0]));
        return value===undefined?null:{value};
      }
      return null;
    }
    async all(statement){return {results:await this.rowsFor(statement),meta:{changes:0}}}
    async run(statement){return {results:[],meta:{changes:0}}}
    async rowsFor(statement){
      const sql=statement.source;
      if(sql.includes("m.name='감스트'")&&sql.includes('LEFT JOIN card_unique_effects'))return discoveredSources;
      if(sql.includes("WHERE UPPER(c.rarity)='FUR'"))return candidates;
      if(sql.includes("SELECT id FROM users WHERE UPPER(role)='OWNER'"))return [{id:1}];
      return [];
    }
    async batch(statements){
      const results=[];
      for(const statement of statements){
        // Statements without bind() still have to obey the same contract.
        assert.equal(statement.values.length,__postgresCompatTest.bindQuestionMarks(statement.source).count,`SQL 바인딩 불일치: ${statement.source.slice(0,120)}`);
        let changes=0;
        if(statement.source.startsWith('INSERT OR IGNORE INTO app_meta')&&statement.values[0]=== 'gamst_card_retirement_v2001_completed'){
          if(!this.meta.has(statement.values[0])){this.meta.set(statement.values[0],statement.values[1]);changes=1}
        }
        if(statement.source.startsWith('UPDATE app_meta SET value=')&&statement.values[1]==='gamst_card_retirement_v2001_completed'){
          if(this.meta.get(statement.values[1])===statement.values[2]){this.meta.set(statement.values[1],statement.values[0]);changes=1}
        }
        const rows=await this.rowsFor(statement);
        results.push({results:rows,meta:{changes}});
      }
      return results;
    }
  }
  const result=await ensureGamstCardRetirement({DB:new FakeDb()},{refundByLevel});
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.ownershipRows,0);
  assert.equal(result.replayed,false);
  assert.deepEqual(result.sourceCardIds,[ATTACK_SOURCE,HP_SOURCE,'FUR-LEGACY-GAMST'].sort());
});

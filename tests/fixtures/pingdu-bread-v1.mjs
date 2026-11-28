import {fixture as createGameDatabase} from './golden-axe-v1.mjs';
import {handlePingduBread} from '../../functions/_pingdu_bread.js';
import {SOOP_WATCH_PREFIX} from '../../functions/_soop_watch.js';
import {CNINE_WINTER_BOX,WINTER_BOX_CONTENTS} from '../../shared/cnine-winter-box-v1.mjs';

export async function breadFixture() {
  const game = await createGameDatabase();
  await game.pg.exec(`
    ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT '';
    UPDATE users SET nickname=CASE id WHEN 1 THEN '겨울손님' WHEN 2 THEN '눈송이' ELSE '트럭운영자' END;
    CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT UNIQUE);
    INSERT INTO user_second_verifications VALUES(1,'PLAYDK','bread-1'),(2,'PLAYDK','bread-2');
  `);
  for (const item of [...WINTER_BOX_CONTENTS.filter(row=>row.code!=='COIN'),CNINE_WINTER_BOX,
    {code:'FUTURE_GAME_ITEM',name:'새로 등록한 아이템'},{code:'INACTIVE_GAME_ITEM',name:'보관 아이템'}]) {
    await game.pg.query('INSERT INTO inventory_items(code,name,is_active) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [item.code,item.name,item.code==='INACTIVE_GAME_ITEM'?0:1]);
  }
  await game.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[SOOP_WATCH_PREFIX+'1',JSON.stringify({version:1,userId:1,providerUuid:'bread-1',soopUserId:'viewer-1'})]);
  const calls = [];
  const provider = {
    async getDailyPostCount(input) { calls.push(['posts',input]); return {...input,timezone:'Asia/Seoul',count:3}; },
    async getWatchRanking(input) { calls.push(['watch',input]); return {ranking:{data:[{watchSeconds:input.streamerIds.length===1?120:7261}]}}; }
  };
  const owner = {id:99,role:'OWNER',nickname:'트럭운영자'}, player = {id:1,role:'USER',nickname:'겨울손님'};
  async function http(path, actor, options={}) {
    const {body,query,origin} = options;
    const url = new URL('https://game.example/api/'+path);
    for (const [key,value] of Object.entries(query||{})) url.searchParams.set(key,value);
    const request = new Request(url,{method:body?'POST':'GET',headers:origin?{origin}:{},body:body?JSON.stringify(body):undefined});
    return handlePingduBread({path,request,env:game.env,deps:{
      authenticate:async()=>actor,requirePermission:async()=>actor,readBody:async request=>request.json(),json:(value,status=200)=>Response.json(value,{status}),
      playdkIdentityClient:()=>provider,playdkDailyQuestSettings:async()=>({boardSlugs:['skm']}),
      withUserMutationLock:async (_env,_id,_path,operation)=>operation()
    }});
  }
  const call=(action,body,actor=player,query) => http((action.startsWith('admin:')?'admin/':'events/')+'pingdu-bread/'+action.replace('admin:',''),actor,{body,query});
  return {...game,owner,player,calls,provider,http,call};
}

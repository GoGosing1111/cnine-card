import {rankedPublicMercenary} from '../shared/ranked-series-v1.mjs';
import {EQUIPMENT_SET_PARTS} from '../shared/equipment-set-visual-v1.mjs';
import {isLevelComplete,mercenaryLevelStateFromStorage,mercenaryLevelStorageLevel} from '../shared/mercenary-level-v1.mjs';
import {readMercenaryDocument} from './_mercenary_account.js';
import {ownedMercenaryLevelCatalog} from './_mercenary_level.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointOperation,runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointError,jointResponseError,readJointBody} from './_joint_request.js';

export const EMPEROR_BOX={
  code:'EMPEROR_EQUIPMENT_CHOICE_15',name:'엠퍼러 +15 장비 선택상자',category:'SUPPLY_BOX',rarity:'EMPEROR',
  subtitle:'EMPEROR ARMORY',image:'assets/items/emperor-equipment-choice-15-v1.webp',
  description:'엠퍼러 슈트·레깅스·슈즈·듀얼디스크 중 원하는 부위의 +15 장비 1개를 받습니다.'
};
export const LEVEL_TICKET={
  code:'MERCENARY_BREAKTHROUGH_21',name:'용병 21레벨 최종 돌파권',category:'EVENT',rarity:'MYTHIC',
  subtitle:'MERCENARY ASCENSION',image:'assets/items/mercenary-breakthrough-21-v1.webp',
  description:'영구 보유한 용병 1명을 현재 레벨과 경험치에 관계없이 21레벨까지 즉시 성장시킵니다. 5·10·15·20레벨 돌파가 모두 적용됩니다.'
};
const items=new Map([EMPEROR_BOX,LEVEL_TICKET].map(item=>[item.code,item]));
const parts=Object.values(EQUIPMENT_SET_PARTS.EMPEROR);
const fail=(message,status=409)=>Object.assign(jointError('JOINT_CHOICE_UNAVAILABLE',message,status),{terminal:true});

async function ticketState(db,userId,code){
  const row=await db.prepare(`SELECT i.is_active,COALESCE(u.quantity,0) AS quantity,
    (SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1) AS pending
    FROM inventory_items i LEFT JOIN cnine_user_inventory u ON u.item_code=i.code AND u.user_id=? WHERE i.code=?`).bind(userId,code,userId,code).first();
  return {enabled:Number(row?.is_active)===1,quantity:Number(row?.quantity||0),pendingRequestId:row?.pending||null};
}

async function equipmentTargets(db){
  const {results}=await db.prepare(`SELECT id,code,name,slot FROM character_equipment_items
    WHERE code IN (?,?,?,?) AND is_active=1 AND is_public=1`).bind(...parts).all();
  return parts.flatMap((code,index)=>{
    const row=results.find(r=>r.code===code&&EQUIPMENT_SET_PARTS.EMPEROR[r.slot]===code);
    return row?[{code,name:row.name,slot:row.slot,artIndex:index,equipmentId:String(row.id),level:15}]:[];
  });
}

async function mercenaryTargets(env,userId,code){
  // Start from real owned copies: loan-only combat entries have no permanent growth record to promote.
  const [rows,{document}]=await Promise.all([
    env.DB.prepare(`SELECT c.mercenary_code,l.level,l.experience,l.breakthrough_mask,l.revision
      FROM user_mercenary_cards_v1 c LEFT JOIN user_mercenary_levels_v1 l ON l.user_id=c.user_id AND l.mercenary_code=c.mercenary_code
      WHERE c.user_id=? AND c.total_copies>0`+(code?' AND c.mercenary_code=?':'')).bind(userId,...(code?[code]:[])).all(),
    readMercenaryDocument(env)
  ]);
  const catalog=await ownedMercenaryLevelCatalog(env,userId,rows.results,document);
  return rows.results.flatMap(row=>{
    const card=catalog.find(c=>c.code===row.mercenary_code);
    if(!card?.rank)return [];
    const growth=mercenaryLevelStateFromStorage(row.level==null?null:row);
    return [{code:card.code,name:card.name,rank:card.rank,identityLabel:rankedPublicMercenary(card).identityLabel,level:growth.level,revision:growth.revision,complete:isLevelComplete(growth)}];
  });
}

function selectedReward(target,item){
  return item===EMPEROR_BOX?{code:target.code,name:target.name,level:15,slot:target.slot,artIndex:target.artIndex}:
    {code:target.code,name:target.name,rank:target.rank,identityLabel:target.identityLabel,beforeLevel:target.level,level:21,breakthroughMask:15};
}

function equipmentGrant(db,userId,requestId,target){
  const p=(sql,...values)=>db.prepare(sql).bind(...values);
  const token=crypto.randomUUID(),values=[userId,target.equipmentId,EMPEROR_BOX.code,requestId];
  const insert="INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(?,?,'CHOICE_BOX',?,?)";
  const guard=jointGuard(db,token,'EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND code=? AND slot=? AND is_active=1 AND is_public=1)',[target.equipmentId,target.code,target.slot]);
  // The production instances table is large. Carry the new ID directly to its forge row.
  const grant=db.dialect==='postgres'?[p(`WITH granted AS (${insert} RETURNING id,user_id)
    INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) SELECT id,user_id,15,1 FROM granted`,...values)]:
    [p(insert,...values),p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(last_insert_rowid(),?,15,1)',userId)];
  return [guard,...grant,jointGuardEnd(db,token)];
}

function mercenaryPromotion(db,userId,target,reward){
  const p=(sql,...values)=>db.prepare(sql).bind(...values),token=crypto.randomUUID();
  const next={level:reward.level,experience:0,breakthroughMask:reward.breakthroughMask,revision:target.revision+1};
  const stored=mercenaryLevelStorageLevel(next);
  return [
    jointGuard(db,token,`EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies>0)
      AND COALESCE((SELECT CASE WHEN breakthrough_mask=15 THEN -1 ELSE revision END FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=?),0)=?`,
      [userId,target.code,userId,target.code,target.revision]),
    p(`INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at)
      VALUES(?,?,?,0,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET
      level=excluded.level,experience=0,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at
      WHERE user_mercenary_levels_v1.revision=? AND user_mercenary_levels_v1.breakthrough_mask<>15`,
      userId,target.code,stored,next.breakthroughMask,next.revision,target.revision),
    p(`UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_levels_v1
      WHERE user_id=? AND mercenary_code=? AND level=? AND experience=0 AND breakthrough_mask=15 AND revision=?) THEN 1 ELSE 0 END WHERE token=?`,
      userId,target.code,stored,next.revision,token),jointGuardEnd(db,token)
  ];
}

function receipt(op){
  const {input,reward}=op.plan;
  return {requestId:op.requestId||op.request_id,status:op.status,itemCode:op.kind||input.itemCode,
    ...(op.status==='COMPLETED'?{consumed:1,reward,replayed:op.replayed===true}:{input})};
}

export async function handleInventoryChoice({path,request,env,deps}){
  const [,code,action]=path.split('/'),item=items.get(code);
  if(!item||!['options','use','receipt'].includes(action)||path!=='item-choice/'+code+'/'+action)return null;
  const reply=(body,status=200)=>deps.json(body,status,{'cache-control':'private, no-store','vary':'Authorization'});
  try{
    if(request.method!==(action==='use'?'POST':'GET'))throw jointError('JOINT_METHOD','요청 방식을 확인하세요.',405);
    const user=await deps.authenticate(request,env);
    if(!user)throw jointError('JOINT_AUTH','로그인이 필요합니다.',401);
    const db=env.DB;
    const targets=targetCode=>item===EMPEROR_BOX?equipmentTargets(db):mercenaryTargets(env,user.id,targetCode);
    if(action==='options'){
      const [state,choices]=await Promise.all([ticketState(db,user.id,code),targets()]);
      return reply({userId:Number(user.id),item,...state,choices:choices.map(({equipmentId,...choice})=>choice)});
    }
    if(action==='receipt'){
      const op=await readJointOperation(env,user.id,new URL(request.url).searchParams.get('requestId'),code);
      return reply(receipt({...op,replayed:true}));
    }
    const body=await readJointBody(request,{fields:item===EMPEROR_BOX?['requestId','targetCode']:['requestId','targetCode','revision']});
    const validTarget=item===EMPEROR_BOX?parts.includes(body.targetCode):
      typeof body.targetCode==='string'&&/^V-\d{3}$/.test(body.targetCode)&&Number.isSafeInteger(body.revision)&&body.revision>=0;
    if(!validTarget)
      throw fail('사용할 대상을 다시 선택하세요.',400);
    const input={itemCode:code,targetCode:body.targetCode,...(item===LEVEL_TICKET?{revision:body.revision}:{})};
    let preparedHere=false;
    const result=await deps.withUserMutationLock(env,user.id,path,()=>runJointOperation(env,user,{
      requestId:body.requestId,kind:code,input,
      prepare:async()=>{
        const [stock,choices]=await Promise.all([ticketState(db,user.id,code),targets(body.targetCode)]);
        if(stock.pendingRequestId)throw jointError('JOINT_CHOICE_PENDING','처리 중인 이전 사용 결과를 먼저 확인하세요.',409);
        if(!stock.enabled||stock.quantity<1)throw fail('사용할 아이템이 없습니다.');
        const target=choices.find(choice=>choice.code===body.targetCode);
        if(!target)throw fail('선택 가능한 대상을 다시 확인하세요.');
        if(target.complete)throw fail('이미 21레벨 최종 돌파를 완료한 용병입니다.');
        if(item===LEVEL_TICKET&&target.revision!==input.revision)throw fail('용병의 성장 상태가 바뀌었습니다. 다시 선택하세요.');
        preparedHere=true;
        return {input,target,reward:selectedReward(target,item)};
      },
      statements:async plan=>{
        const {target,reward}=plan;
        const p=(sql,...values)=>db.prepare(sql).bind(...values);
        // A prepared use can be resumed after an outage. Cancel stale plans before charging.
        const locks=[],promoting=item===LEVEL_TICKET;
        const targetQuery=promoting?p(`SELECT c.total_copies,COALESCE(l.revision,0) AS revision,COALESCE(l.breakthrough_mask,0) AS mask
          FROM user_mercenary_cards_v1 c LEFT JOIN user_mercenary_levels_v1 l ON l.user_id=c.user_id AND l.mercenary_code=c.mercenary_code
          WHERE c.user_id=? AND c.mercenary_code=?`,user.id,target.code):
          p('SELECT id FROM character_equipment_items WHERE id=? AND code=? AND slot=? AND is_active=1 AND is_public=1',target.equipmentId,target.code,target.slot);
        const [stock,current]=await Promise.all([ticketState(db,user.id,code),targetQuery.first()]);
        if(!stock.enabled||stock.quantity<1)throw fail('보유 수량이 변경됐습니다. 아이템을 다시 확인하세요.');
        if(promoting){
          if(!preparedHere&&!(await targets(target.code)).some(c=>c.code===target.code))throw fail('현재 성장시킬 수 있는 용병을 다시 선택하세요.');
          if(!current||Number(current.total_copies)<1||Number(current.mask)===15||Number(current.revision)!==target.revision)throw fail('용병의 보유 또는 성장 상태가 바뀌었습니다. 다시 선택하세요.');
          if(db.dialect==='postgres')locks.push(p('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? FOR UPDATE',user.id,target.code));
        }else{
          if(!current)throw fail('선택한 장비의 등록 상태가 바뀌었습니다. 다시 선택하세요.');
          if(db.dialect==='postgres')locks.push(p('SELECT id FROM character_equipment_items WHERE id=? FOR SHARE',target.equipmentId));
        }
        if(db.dialect==='postgres')locks.push(p('SELECT item_code FROM cnine_user_inventory WHERE user_id=? AND item_code=? FOR UPDATE',user.id,code));
        return [...locks,...jointInventoryChange(db,user.id,code,-1,item.name+' 사용',body.requestId),
          ...(item===EMPEROR_BOX?equipmentGrant(db,user.id,body.requestId,target):mercenaryPromotion(db,user.id,target,reward))];
      }
    }));
    return reply(receipt(result));
  }catch(error){return jointResponseError(error,reply);}
}

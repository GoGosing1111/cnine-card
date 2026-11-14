import { AdvancementEffects } from './AdvancementEffects.mjs';
import { AdvancementStateEffects } from './AdvancementStateEffects.mjs';

const base = '/assets/ui/mercenary-advancement-v1/';
const battles = new WeakMap();
let manifest, instanceId = 0;

export function playAdvancement(engine, event) {
  if (!engine.visible) return;
  let battle = battles.get(engine);
  if (!battle) {
    battle = { id: 'advancement-' + ++instanceId, epoch: engine.playbackEpoch };
    battles.set(engine, battle);
    manifest ||= fetch(base+'effects.json').then(response => {
      if (!response.ok) throw Error('전직 이펙트 정보를 불러오지 못했습니다.');
      return response.json();
    }).catch(error => { manifest=null; throw error; });
    battle.ready = manifest.then(data => {
      if (battles.get(engine) !== battle) return;
      battle.burst = new AdvancementEffects(engine,base,data);
      battle.states = new AdvancementStateEffects(engine,{battleId:battle.id,base,manifest:data});
    });
  }
  // Gameplay and the existing hit animation keep their own time while one atlas decodes.
  void battle.ready.then(() => {
    if (battles.get(engine)!==battle || engine.playbackEpoch!==battle.epoch || !engine.visible) return;
    const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.effectTargetId||event.targetId);
    if (!actor || !target) return;
    const visual={id:event.roleId,actor,target,allies:(event.allyIds||[]).map(id=>engine.combatantById(id)).filter(Boolean)};
    const tasks=[];
    if (event.burst!==false) tasks.push(battle.burst.play({...visual,eventId:battle.id+':'+event.revision}));
    if ('charged' in event || 'remaining' in event || 'active' in event) {
      tasks.push(battle.states.apply({...visual,battleId:battle.id,revision:event.revision,charged:event.charged,remaining:event.remaining,active:event.active}));
    }
    return Promise.all(tasks);
  }).catch(error => {
    if (battles.get(engine)!==battle) return;
    if (!battle.burst) battles.delete(engine);
    console.warn('[용병 전직]',error.message);
  });
}
export function clearAdvancement(engine) {
  const battle=battles.get(engine);
  if (!battle) return;
  battles.delete(engine);
  const previous=engine.mercenaryAdvancementReleasePromise;
  engine.mercenaryAdvancementReleasePromise=Promise.allSettled([previous,battle.states?.destroy(),battle.burst?.destroy()]);
  return engine.mercenaryAdvancementReleasePromise;
}

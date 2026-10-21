import {BattleEngine as ContinuousBattleEngine} from '../preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
export class BattleEngine extends ContinuousBattleEngine{
  battlefieldAsset(){
    const content=({'카우방':'cow-room','무한의탑':'tower','폐차장':'scrapyard'})[this.battleData?.title]||globalThis.document?.body?.dataset.content;
    return {tower:'/assets/ui/tower-abyss-20261021/sanctum.webp','cow-room':'/assets/ui/project-v/battlefields/v3-cow-pasture-v1.png',scrapyard:'/assets/ui/scrapyard/scrapyard-arena-v1676.png'}[content]||'/assets/ui/scrapyard/scrapyard-arena-v1676.png';
  }
}

import {BattleEngine as ContinuousBattleEngine} from '../preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
export class BattleEngine extends ContinuousBattleEngine{
  get battlefieldAsset(){return {tower:'/assets/ui/project-v/battlefields/v3-infinite-tower-sanctum-v1.png','cow-room':'/assets/ui/project-v/battlefields/v3-cow-pasture-v1.png',scrapyard:'/assets/ui/scrapyard/scrapyard-arena-v1676.png'}[globalThis.document?.body?.dataset.content]||'/assets/ui/scrapyard/scrapyard-arena-v1676.png';}
}

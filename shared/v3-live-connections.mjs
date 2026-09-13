// Production destinations only. These links never authorize opening or entry.
import {TOWER_LIVE_URL} from './pve-public-release-v2092.mjs';
export const V3_LIVE_CONNECTIONS=Object.freeze({
  TOWER:{label:'무한의탑',url:TOWER_LIVE_URL,state:'tower/status',run:'tower/fight',policy:'LEGACY'},
  MERCENARY:{label:'용병 지휘소',url:'/mercenary-hangar/',state:'mercenaries/v3/state',run:'mercenaries/v3/loadout',result:'mercenaries/v3/receipt'},
  MERCENARY_PACK:{label:'용병카드 하이퍼팩',url:'/?screen=buy&pack=hyper',state:'mercenary-cards/feature',run:'mercenary-cards/open',batch:'mercenary-cards/open-batch',result:'mercenaries/v3/receipt'},
  SCRAPYARD:{label:'폐차장',url:'/?screen=scrapyard',state:'scrapyard/v3/state',run:'scrapyard/v3/run',result:'scrapyard/v3/result'},
  COW_ROOM:{label:'카우방',url:'/?screen=battle&pve=cow-room',state:'cow-room/v3/state',run:'cow-room/v3/run',result:'cow-room/v3/result',portals:'cow-room/v3/portals'},
});

import {initialMercenaryLevel} from '../../shared/mercenary-level-v1.mjs?v=20261025-cap21-v1';
import {mercenaryGrowthLaunchPolicy} from '../../shared/mercenary-growth-launch-20261016.mjs';
// Loopback-only fake ownership. Economy now matches the explicitly approved launch.
export function levelDemo(){
 const policy=mercenaryGrowthLaunchPolicy();
 const cards=[{code:'V-004',name:'베스페라',rank:'SS',sourceArt:'assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png'},{code:'V-009',name:'련화',rank:'SS',sourceArt:'assets/ui/project-v/mercenaries/crimson-constellation-rifle-mercenary-v2.png'},{code:'V-013',name:'라비에나',rank:'S',sourceArt:'assets/ui/project-v/mercenaries/short-bob-k2-amethyst-officer-mercenary-source-art-v1.png'}].map(c=>({...c,totalCopies:31,duplicates:30,growth:initialMercenaryLevel()}));
 cards.unshift(...[{code:'V-049',name:'크라이베른',rank:'SSS',sourceArt:'assets/ui/project-v/mercenaries/cryvern-source-art-v1.png'},{code:'V-055',name:'베르칸',rank:'SSS',sourceArt:'assets/ui/project-v/mercenaries/approved-20260927/berkan-source-art-v1.png'},{code:'V-996',name:'발테르',rank:'SSS',edition:'LIMITED',sourceArt:'assets/ui/project-v/mercenaries/limited-20261002/v-996-source-art.png'}].map(c=>({...c,totalCopies:31,duplicates:30,growth:initialMercenaryLevel()})));
 return {enabled:true,userId:null,policy,cards};
}

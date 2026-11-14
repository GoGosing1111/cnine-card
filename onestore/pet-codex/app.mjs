import {mountPetEquipment} from '/onestore/js/pet-equipment-window-v1.mjs?v=20261114-growth-live';
import {createLivePetGrowthAdapter} from '/js/pet-growth-live-adapter-v2.mjs';
const adapter=createLivePetGrowthAdapter();
mountPetEquipment(document.getElementById('pet-codex'),{codex:true,growth:{layout:'unified',live:true,adapter,async createEffectPreview(host,options){const {createEffectPreview}=await import('/preview/pet-rework-20261114/fx-preview.bundle.mjs');return createEffectPreview(host,options);}}});
for(const [src,attributes] of [
 ['/onestore/js/soopketmon-v21-exact-shell-adapter.js?v=20261009-pet-codex',{enabled:'false'}],
 ['/onestore/js/adventure-lobby-v2107.js?favorites=20261013-v1&v=20261012-support-hidden1&tacticalNav=20261030-shell1&growthGuide=20261030-1',{}],
 ['/onestore/js/adventure-navigation-standalone.js?v=2108-shared-navigation',{route:'petDex'}]
])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;Object.assign(script.dataset,attributes);script.onload=resolve;script.onerror=reject;document.head.append(script);});

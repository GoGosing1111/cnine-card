import {mountPetEquipment} from '/js/pet-equipment-window-v1.mjs?v=20261009-pet-codex';
mountPetEquipment(document.getElementById('pet-codex'),{codex:true});
for(const [src,attributes] of [
 ['/js/soopketmon-v21-exact-shell-adapter.js?v=20261009-pet-codex',{enabled:'false'}],
 ['/js/adventure-lobby-v2107.js?v=20261009-pet-codex',{}],
 ['/js/adventure-navigation-standalone.js?v=2108-shared-navigation',{route:'petDex'}]
])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;Object.assign(script.dataset,attributes);script.onload=resolve;script.onerror=reject;document.head.append(script);});

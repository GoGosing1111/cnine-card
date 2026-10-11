// Equipment illustrations only; gameplay values come from city state.
const gear=(file,name)=>Object.freeze({file,name});
export const CITY_EXPLORATION_ART=Object.freeze({
 CROWBAR:gear('crowbar','쇠지렛대'),BAT:gear('bat','알루미늄 배트'),KNIFE:gear('knife','전술 단검'),CROSSBOW:gear('crossbow','사냥 석궁'),SHOTGUN:gear('shotgun','산탄총'),SMG:gear('smg','기관단총'),SNIPER:gear('sniper','정밀 저격총'),
 JACKET:gear('jacket','가죽 재킷'),WORK_VEST:gear('work-vest','작업 조끼'),PADDED:gear('padded','보강 방호복'),KEVLAR:gear('kevlar','방탄 조끼'),RIOT:gear('riot','진압 방어구'),PLATE:gear('plate','중장갑 플레이트')
});
export function cityExplorationArt(code,compact=false){
 const art=Object.hasOwn(CITY_EXPLORATION_ART,code)?CITY_EXPLORATION_ART[code]:null;if(!art)return '';
 const base='/assets/ui/jokgak-city/exploration-v2/'+art.file;
 return `<span class="jc-item-art jc-item-art--equipment" data-city-item-art="${code}"><img src="${base}-768.webp" srcset="${base}-256.webp 256w, ${base}-768.webp 768w" sizes="${compact?'(max-width: 800px) 150px, 180px':'(max-width: 600px) 280px, 340px'}" width="768" height="768" alt="${art.name}" decoding="async" draggable="false"></span>`;
}

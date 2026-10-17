export const JOKRO_LINES=Object.freeze([
 '칼끝이 닿기 전에, 승부는 끝났다.',
 '흐름을 읽어라. 베이는 것은 한순간이다.',
 '청룡이 지나간 자리엔 고요만 남는다.',
 '검을 뽑는 순간, 물러설 길은 없다.',
 '이 한 칼로, 하늘마저 가른다.'
]);
export class JokroDialogue {
 constructor(doc){this.root=doc.getElementById('limited-dialogue');this.quote=doc.getElementById('limited-quote');this.skill=doc.getElementById('limited-skill');this.index=-1;this.active=false;this.quote.textContent=JOKRO_LINES[0];}
 begin(mode,label){
  if(!['attack','skill','ultimate','awakening'].includes(mode))return;
  this.index=(this.index+1)%JOKRO_LINES.length;this.quote.textContent=JOKRO_LINES[this.index];this.skill.textContent=label;this.root.dataset.active='true';this.active=true;
 }
 end(){this.active=false;this.root.dataset.active='false';}
 diagnostics(){return {visible:!this.root.hidden,text:this.quote.textContent,index:this.index,active:this.active,portrait:false};}
 destroy(){this.end();}
}

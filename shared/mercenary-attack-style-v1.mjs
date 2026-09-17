import attachments from '../assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json' with {type:'json'};
export function mercenaryAttackStyle(actor){
 const kind=attachments.cards[actor.code]?.weaponKind;
 return actor.attackStyle||(['GUN','BOW'].includes(kind)?'RANGED':kind==='MAGIC'?'CAST':'MELEE');
}

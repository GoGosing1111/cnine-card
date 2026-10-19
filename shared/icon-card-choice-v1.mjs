import {ICON_FUSION_CARDS} from './icon-fusion-policy-v1.mjs';

export const ICON_CHOICE_ITEM=Object.freeze({code:'ICON_CARD_CHOICE_TICKET',name:'아이콘 카드 선택권',subtitle:'ICON CARD SELECT',description:'현재 일반 제작 가능한 아이콘 8종 중 원하는 카드 1장을 선택해 확정 획득합니다. 선택권 1개를 소모하며 코인·별·재료 카드는 소모하지 않습니다. 제우스 철구와 신규 준비 아이콘은 제외됩니다.',category:'EVENT',rarity:'ICON',image:'assets/items/icon-card-choice-20261020/ticket.webp'});
// Keep this voucher's reviewed eight-card pool fixed when future icons release.
const codes=new Set(['ICON-DIIM','ICON-HI-HEEYA','ICON-NAMUNEUL-BONGSOON','ICON-OH-JOEUN','ICON-ORIKKUNG','ICON-KANGGUYEOL','ICON-AYOON','ICON-GUSUDAENG']);
export const ICON_CHOICE_CARDS=Object.freeze(ICON_FUSION_CARDS.filter(card=>codes.has(card.code)));
export const ICON_CHOICE_VERSION=1;

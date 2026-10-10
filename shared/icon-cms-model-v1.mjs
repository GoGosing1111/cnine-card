import {ICON_CARD_ROSTER} from './icon-card-roster-v1.mjs';
import {emptyIconDraft,validateIconDraft} from './icon-grade-v1.mjs';

export const ICON_CMS_KEY='icon_cms_v1';
export const ICON_CMS_MAX_BYTES=32768;
export const ICON_CMS_LOCKS=Object.freeze({visibility:'CMS_ONLY',publicCodexEnabled:false,battleEnabled:false,acquisitionEnabled:false,evolutionEnabled:false,evolutionStatus:'UNDECIDED'});
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>plain(value)&&Object.keys(value).sort().join(',')===expected.split(',').sort().join(',');
export function emptyIconCmsDocument(){
  return {version:1,...ICON_CMS_LOCKS,cards:ICON_CARD_ROSTER.map(c=>({code:c.code,notes:'',draft:emptyIconDraft()}))};
}
export function validateIconCmsDocument(raw,{allowLegacy=false}={}){
  if(!keys(raw,'version,visibility,publicCodexEnabled,battleEnabled,acquisitionEnabled,evolutionEnabled,evolutionStatus,cards')||raw.version!==1)throw Error('아이콘 CMS 문서 형식을 확인해 주세요.');
  for(const [key,value] of Object.entries(ICON_CMS_LOCKS))if(raw[key]!==value)throw Error('아이콘은 CMS에만 등록하며 도감·전투·획득·진화는 잠금 상태입니다.');
  // Read the exact previous seven-card document without resetting its notes,
  // tuning or revision. Explicit saves must still include the complete roster.
  if(allowLegacy&&Array.isArray(raw.cards)&&raw.cards.length===7&&!raw.cards.some(c=>c?.code==='ICON-ZEUS-CHEOLGU')){
    return validateIconCmsDocument({...raw,cards:[...raw.cards,{code:'ICON-ZEUS-CHEOLGU',notes:'',draft:emptyIconDraft()}]});
  }
  if(!Array.isArray(raw.cards)||raw.cards.length!==ICON_CARD_ROSTER.length)throw Error(`등록된 아이콘 ${ICON_CARD_ROSTER.length}종을 모두 포함해야 합니다.`);
  const cards=ICON_CARD_ROSTER.map(({code})=>{
    const matches=raw.cards.filter(c=>c?.code===code),row=matches[0];
    if(matches.length!==1||!keys(row,'code,notes,draft'))throw Error('등록되지 않거나 중복된 아이콘입니다.');
    if(typeof row.notes!=='string'||row.notes.length>1200)throw Error('운영 메모는 1,200자 이내로 입력해 주세요.');
    const checked=validateIconDraft(row.draft);
    if(!checked.ok)throw Error(checked.errors.join(' '));
    return {code,notes:row.notes,draft:checked.draft};
  });
  return {...emptyIconCmsDocument(),cards};
}
export function validateIconCmsSave(body){
  if(!keys(body,'document,expectedRevision,requestId')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId))throw Error('저장 요청 ID와 현재 버전을 확인해 주세요.');
  return {document:validateIconCmsDocument(body.document),expectedRevision:body.expectedRevision,requestId:body.requestId};
}

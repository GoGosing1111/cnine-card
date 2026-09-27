import {ICON_GRADE} from '../shared/icon-grade-v1.mjs';

const siteRoot=new URL('../',import.meta.url);
export function createIconCard({name,sourceArt,sourceGrade='ZENITH',focusX=50,focusY=50,sourceCrop,sourceWidth,sourceHeight,lazy=false}, doc=globalThis.document) {
  if (typeof sourceArt !== 'string' || !/^assets\/cards\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|avif)$/i.test(sourceArt)) throw new Error('기존 멤버 카드 원화 경로가 필요합니다.');
  const artUrl=new URL(sourceArt,siteRoot);
  if (artUrl.origin!==siteRoot.origin || !artUrl.pathname.startsWith(new URL('assets/cards/',siteRoot).pathname)) throw new Error('기존 멤버 카드 원화만 프리뷰할 수 있습니다.');
  const card=doc.createElement('figure');
  card.className='icon-card';
  const frame=doc.createElement('div');
  frame.className='card-frame grade-ICON';
  frame.setAttribute('role','img');
  frame.setAttribute('aria-label',`${name} 아이콘 프레임 검수용 · 기본 전투력 180,000 · 실제 발급 카드 아님`);
  const art=doc.createElement('img');
  art.className='icon-card-art';art.src=artUrl.href;art.alt='';art.decoding='async';art.width=1024;art.height=1536;
  const focus=value=>typeof value==='number'&&Number.isFinite(value)?Math.min(100,Math.max(0,value)):50;
  art.style.objectPosition=`${focus(focusX)}% ${focus(focusY)}%`;
  art.loading=lazy?'lazy':'eager';
  let portrait=art;
  if(sourceCrop){
    const {left,top,width,height}=sourceCrop;
    if(![left,top,width,height,sourceWidth,sourceHeight].every(Number.isFinite)||left<0||top<0||width<=0||height<=0||sourceWidth<=0||sourceHeight<=0||left+width>sourceWidth||top+height>sourceHeight)throw new Error('원본 사진 안의 유효한 표시 영역이 필요합니다.');
    // Match the fixed frame window (80.4% width, 82.8% height on a 2:3 card).
    // Only the viewport changes: the photograph remains byte-identical.
    const aspect=.804/(.828*1.5);
    const visibleWidth=Math.min(width,height*aspect),visibleHeight=visibleWidth/aspect;
    const x=left+(width-visibleWidth)*focus(focusX)/100,y=top+(height-visibleHeight)*focus(focusY)/100;
    portrait=doc.createElement('div');portrait.className='icon-card-art icon-card-crop';
    art.className='icon-card-crop-source';art.width=sourceWidth;art.height=sourceHeight;
    art.style.width=`${sourceWidth/visibleWidth*100}%`;
    art.style.left=`${-x/visibleWidth*100}%`;art.style.top=`${-y/visibleHeight*100}%`;
    portrait.append(art);
  }
  const border=doc.createElement('img');
  border.className='icon-card-frame';border.src=new URL(ICON_GRADE.frame.source,siteRoot).href;
  border.alt='';border.width=ICON_GRADE.frame.width;border.height=ICON_GRADE.frame.height;border.decoding='async';
  border.loading=lazy?'lazy':'eager';
  frame.append(portrait,border);
  const caption=doc.createElement('figcaption');
  const title=doc.createElement('strong');title.textContent=name;
  const note=doc.createElement('span');note.textContent=sourceGrade==='ICON'?'사용자 지정 원화 · 프리뷰 전용':`${sourceGrade} 원화로 프레임 검수 · 실제 카드 지정 아님`;
  caption.append(title,note);card.append(frame,caption);
  return card;
}

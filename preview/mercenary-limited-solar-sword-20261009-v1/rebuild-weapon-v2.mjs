// Approved source pixels are selected without repainting. Only the grip hidden
// by the source-art fingers has a separately declared completion patch.
import fs from 'node:fs/promises';import sharp from 'sharp';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const source='../../assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png',bytes=await fs.readFile(file(source));
const originalHash='be6bf7819c24c53a7cdb0c2c86d85802afa1e39fdf62d8f4306b8013cce62492';
if(hash(bytes)!==originalHash)throw Error('Source art changed');
const polygons=[
// Original pointed pommel and visible black/gold grip above the fingers.
[[65,413],[69,418],[76,420],[80,413],[84,415],[83,421],[93,424],[109,425],[104,435],[106,442],[109,449],[113,453],[114,462],[121,470],[130,478],[139,487],[142,492],[133,498],[124,489],[114,479],[105,470],[99,471],[95,468],[87,461],[83,460],[81,467],[81,481],[76,471],[72,455],[71,443],[65,443],[50,439],[61,433],[67,425]],
// Visible lower grip and complete original guard, including curved cutouts.
[[176,535],[184,537],[187,544],[192,548],[201,550],[208,548],[215,543],[216,538],[214,532],[211,528],[219,534],[225,536],[229,532],[229,539],[233,540],[238,536],[239,530],[242,515],[244,529],[248,535],[254,535],[268,533],[259,538],[259,541],[271,539],[287,534],[281,540],[278,546],[278,552],[282,557],[288,560],[291,555],[293,548],[299,553],[311,556],[326,559],[349,558],[336,563],[326,568],[319,574],[315,581],[311,591],[306,583],[301,579],[294,576],[287,578],[282,583],[279,591],[279,600],[281,610],[287,618],[292,619],[297,615],[302,606],[298,622],[294,635],[294,643],[298,650],[301,651],[304,644],[306,661],[313,681],[323,700],[336,720],[318,708],[301,697],[284,689],[270,684],[257,681],[239,679],[224,679],[213,681],[190,681],[203,677],[210,672],[213,666],[211,659],[207,655],[201,653],[194,653],[187,655],[185,661],[183,650],[177,650],[169,654],[162,661],[160,670],[160,682],[151,672],[142,667],[132,664],[119,665],[107,668],[122,657],[137,645],[145,635],[147,628],[146,625],[142,624],[138,626],[139,620],[137,617],[133,614],[122,613],[105,609],[120,605],[131,600],[137,593],[138,586],[136,578],[147,586],[153,589],[158,589],[160,585],[159,582],[152,572],[165,576],[170,575],[175,570],[180,562],[178,553],[176,546]],
// Both blade edges, not only the previous left half of the broad blade.
[[299,644],[309,673],[334,711],[363,752],[400,801],[440,853],[479,903],[516,952],[554,1002],[591,1051],[630,1104],[667,1154],[701,1204],[735,1255],[767,1306],[795,1355],[823,1404],[853,1459],[803,1408],[754,1357],[708,1307],[662,1256],[618,1206],[574,1154],[534,1104],[495,1053],[456,1003],[418,951],[382,902],[345,852],[309,803],[278,756],[255,715],[231,687],[223,676],[245,678],[271,689],[292,700],[303,708],[289,682]]
];
const rect={left:42,top:403,width:826,height:1068},grip={x:150,y:525},tip={x:853,y:1459};
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),out=Buffer.alloc(rect.width*rect.height*4);
let copied=0;for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
const sx=x+rect.left,sy=y+rect.top;if(!polygons.some(p=>inside(sx+.5,sy+.5,p)))continue;
const i=(sy*info.width+sx)*4,o=(y*rect.width+x)*4;data.copy(out,o,i,i+4);copied++;}
await fs.mkdir(file('assets/locked/v2'),{recursive:true});
const visible=await sharp(out,{raw:{width:rect.width,height:rect.height,channels:4}}).png().toBuffer();
await fs.writeFile(file('assets/locked/v2/original-visible-weapon.png'),visible);
// Generated guide was inspected. It is used only for the source-art hand's
// hidden dark grip, never for blade/guard/pommel silhouettes or visible RGB.
const guide='assets/sources/weapon-grip-completion-guide-v2.png',guideBytes=await fs.readFile(file(guide));
const patch=await sharp(guideBytes).extract({left:120,top:322,width:52,height:68}).resize(52,58).png().toBuffer();
const pd=await sharp(patch).ensureAlpha().raw().toBuffer(),hidden=[[129,493],[139,489],[184,539],[174,549]],base=Buffer.alloc(out.length);
let completed=0;for(let y=489;y<550;y++)for(let x=128;x<185;x++){
if(!inside(x+.5,y+.5,hidden))continue;const dx=x-128,dy=y-489,px=Math.max(0,Math.min(51,dx)),py=Math.max(0,Math.min(57,dy)),si=(py*52+px)*4,o=((y-rect.top)*rect.width+x-rect.left)*4;
pd.copy(base,o,si,si+4);base[o+3]=255;completed++;}
const png=await sharp(base,{raw:{width:rect.width,height:rect.height,channels:4}}).composite([{input:visible,left:0,top:0}]).png().toBuffer();
await fs.writeFile(file('assets/locked/v2/complete-sword.png'),png);
const cfg={version:'FULL_SWORD_V2_ORIGINAL_CONTOUR_CORRECTION',source,sourceSha256:originalHash,sha256:hash(png),visibleRasterSha256:hash(visible),width:rect.width,height:rect.height,rect,sourceGrip:grip,sourceTip:tip,grip:{x:grip.x-rect.left,y:grip.y-rect.top},tip:{x:tip.x-rect.left,y:tip.y-rect.top},standingHelmetToSole:1345,polygons,copiedPixels:copied,completionPixels:completed,redrawnVisiblePixels:0,completion:{guide,guideSha256:hash(guideBytes),scope:'ONLY_HANDLE_HIDDEN_BY_ORIGINAL_FINGERS',polygon:hidden},transformsAllowed:['uniformScale','translation','rotation'],status:'CORRECTED_USER_REVIEW_PENDING'};
await fs.writeFile(file('assets/locked/v2/weapon-provenance.json'),JSON.stringify(cfg,null,2)+'\n');
const overlay=await sharp(visible).tint('#00ddff').modulate({brightness:.7}).png().toBuffer();
await sharp(bytes).composite([{input:overlay,left:rect.left,top:rect.top}]).png().toFile(file('qa/weapon-v2-selection.png'));
console.log(JSON.stringify({copiedPixels:copied,completionPixels:completed,sha256:hash(png)}));

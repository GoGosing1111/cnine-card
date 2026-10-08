// Coordinates are resting formation feet in the effect layer, never animated
// actor positions. Pets stay in the support layer and consume no combat slot.
export function petSupportPosition({points,side,pvp,suit,width,height,scale,size}){
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),maxY=Math.max(...points.map(p=>p.y));
  const margin=Math.max(70,38/scale),below=scale<.65?Math.max(68,size+12/scale):68;
  let x=pvp?(minX+maxX)/2:(side==='A'?minX-55:maxX+55),y=maxY+below;
  if(!pvp&&side==='A'&&suit){
    x=suit.x-suit.halfWidth-size*.4-Math.max(12,12/scale);y=suit.y;
    // Portrait formations have another card to the suit's left. Use the
    // space between their resting feet, reducing the pet instead of putting
    // the mobile minimum-size sprite on top of that card.
    const neighbor=points.filter(p=>p.x<suit.x-1&&Math.abs(p.y-suit.y)<size*.5).sort((a,b)=>b.x-a.x)[0];
    if(neighbor){x=(neighbor.x+suit.x)/2;size=Math.min(size,(suit.x-neighbor.x)*.6);}
  }
  return {x:Math.max(margin,Math.min(width-margin,x)),y:Math.max(size+8,Math.min(height-60/scale,y)),size};
}

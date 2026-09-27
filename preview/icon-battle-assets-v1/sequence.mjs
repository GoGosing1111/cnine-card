export function sampleIconSequence(effect,time){
  const duration=Number(effect?.duration),count=Number(effect?.frameCount),contact=Number(effect?.collisionFrame);
  if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(count)||count<2||!Number.isInteger(contact)||contact<0||contact>=count)throw Error('INVALID_ICON_SEQUENCE');
  const t=Math.max(0,Math.min(duration,Number.isFinite(time)?time:0));
  const position=t/duration*(count-1),frame=Math.min(count-1,Math.floor(position+1e-8));
  return {time:t,frame,nextFrame:Math.min(frame+1,count-1),mix:Math.max(0,position-frame),
    visible:t>0&&t<duration,contactAt:duration*contact/(count-1),contactReached:t>=duration*contact/(count-1),
    phase:t===0?'대기':frame<3?'준비':frame<contact?'접촉':frame<=contact+2?'충돌':frame<10?'확산':t<duration?'소멸':'완료'};
}

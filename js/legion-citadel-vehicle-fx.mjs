import {vehicleBattleGroups, VEHICLE_ART} from '../shared/vehicle-battle-art-v1.mjs';
import {mercenaryVehicleSupport, vehicleBuffText} from '../shared/mercenary-vehicle-support-v1.mjs';

const transit = '/assets/effects/vehicle-transit-v1/';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pose = (offset, opacity, transform) => ({offset, opacity, transform});

function image(src, className, parent) {
  const node = document.createElement('img');
  node.alt = '';
  node.className = className;
  node.src = src;
  node.draggable = false;
  parent.append(node);
  return node;
}

function enter(parent, group, elapsed) {
  const stage = document.createElement('div');
  stage.className = 'ct-vehicle-arrival';
  stage.setAttribute('aria-hidden','true');
  const art = VEHICLE_ART[group.vehicle], body = art?.body || group.image;
  parent.append(stage);
  function animate(node, frames) {
    if (reducedMotion()) frames = frames.map(({offset, opacity}) => ({offset, opacity}));
    const animation = node.animate(frames, {duration:2900, fill:'both', easing:'linear'});
    // A future owner's cue uses a positive delay. Reconnecting seeks the current cue.
    animation.currentTime = Math.max(0, elapsed);
    if (elapsed < 0) animation.effect.updateTiming({delay:-elapsed});
    return animation;
  }
  const gate = image(transit+'gate.webp','ct-vehicle-gate',stage);
  animate(gate,[pose(0,0,'scale(.35)'),pose(.12,1,'scale(.98)'),pose(.26,.94,'scale(1.05)'),pose(.47,0,'scale(1.18)'),pose(1,0,'scale(1.18)')]);
  const dust = image(transit+'pressure.webp','ct-vehicle-pressure',stage);
  animate(dust,[pose(0,0,'scale(.35)'),pose(.20,.7,'scale(.75)'),pose(.43,0,'scale(1.35)'),pose(1,0,'scale(1.35)')]);
  const wake = image(transit+'wake.webp','ct-vehicle-wake',stage);
  animate(wake,[pose(0,0,'translateX(-15%)'),pose(.39,0,'translateX(-15%)'),pose(.55,.9,'translateX(20%) scale(1.1)'),pose(.75,0,'translateX(85%) scale(1.6)'),pose(1,0,'translateX(85%)')]);
  if (body) {
    const frame = document.createElement('div');
    frame.className = 'ct-vehicle-body-frame';
    stage.append(frame);
    const car = image(body,'ct-vehicle-body',frame);
    car.classList.toggle('ct-showroom',!art);
    // Body art authored for the premium tier faces left.
    const flip = art || group.vehicle === 'ASTRA_VOLT' ? -1 : 1;
    car.style.scale = flip+' 1';
    animate(frame,[pose(0,0,'translateX(-52%) scale(.35)'),pose(.12,0,'translateX(-52%) scale(.35)'),pose(.29,1,'translateX(-2%) scale(1)'),pose(.45,1,'translateX(0) scale(1)'),pose(.60,.99,'translateX(54%) scale(1.03)'),pose(.74,0,'translateX(178%) scale(1.09)'),pose(1,0,'translateX(178%)')]);
  }
  const bloom = image(transit+'bloom.webp','ct-vehicle-bloom',stage);
  const end = animate(bloom,[pose(0,0,'scale(.3)'),pose(.54,0,'scale(.3)'),pose(.65,.93,'scale(.87)'),pose(.87,0,'scale(1.44)'),pose(1,0,'scale(1.44)')]);
  const spec = mercenaryVehicleSupport(group.rows[0]);
  if (spec?.attackPercent) {
    const label = document.createElement('span');
    label.className = 'ct-vehicle-stats';
    label.textContent = vehicleBuffText(spec);
    stage.append(label);
    animate(label,[pose(0,0,'translateY(4px)'),pose(.54,0,'translateY(4px)'),pose(.62,1,'translateY(0)'),pose(.90,1,'translateY(0)'),pose(1,0,'translateY(-3px)')]);
  }
  end.finished.then(() => stage.remove(),()=>{});
}

export function mountLightVehicleSupport(arena, teams, tile) {
  const groups = vehicleBattleGroups(teams);
  if (!groups.length) return;
  const floor = document.createElement('div'), front = document.createElement('div');
  floor.className = 'ct-vehicle-floors';
  front.className = 'ct-vehicle-front';
  arena.append(floor, front);
  const feet = new Map();
  for (const [g, group] of groups.entries()) {
    for (const [i, row] of group.rows.entries()) {
      const node = document.createElement('div');
      const art = VEHICLE_ART[group.vehicle];
      node.className = 'ct-vehicle-foot';
      node.hidden = true;
      node.title = row.name+' · '+vehicleBuffText(mercenaryVehicleSupport(row));
      const seal = image(art.floor, 'ct-vehicle-emblem', node);
      floor.append(node);
      const index = teams[group.side].mercenaries.indexOf(row);
      feet.set(row.id, {node, seal, row, vehicle:group.vehicle, at:g*1150+1560+i*110, slot:{kind:'mercenaries', index, enemy:group.side==='B'}});
    }
  }
  const layout = () => {
    const {width, height} = floor.getBoundingClientRect();
    for (const {node, slot} of feet.values()) {
      const {x,y,tw,th} = tile(slot,width,height);
      Object.assign(node.style,{left:(x+tw*.5)+'px', top:(y+th-16)+'px', width:tw*1.08+'px', height:tw*.39+'px'});
    }
  };
  const observer = new ResizeObserver(layout);
  observer.observe(floor);
  let started = false;
  return {
    update(state, serverNow) {
      if (!state?.startsAt) return;
      const elapsed = serverNow-state.startsAt;
      if (!started) {
        started = true;
        groups.forEach((group,i) => {if (elapsed < i*1150+2900) enter(front,group,elapsed-i*1150);});
        for (const foot of feet.values()) {
          const delay = Math.max(0,foot.at-elapsed);
          if (delay || elapsed<foot.at+260) foot.node.animate([{opacity:0},{opacity:1}],{duration:260,delay,fill:'backwards'});
          foot.node.hidden = false;
        }
      }
      if (state.fighters) for (const f of state.fighters.A) {
        const foot = feet.get(f.id);
        if (foot && foot.node.hidden !== (f.hp <= 0)) foot.node.hidden = f.hp <= 0;
      }
    },
    impact(event) {
      for (const [id, vehicle] of [[event.actorId,event.vehicleSupportHit],[event.targetId,event.vehicleSupportGuard]]) {
        const foot = vehicle && feet.get(id);
        if (!foot || foot.vehicle !== vehicle || foot.node.hidden) continue;
        foot.seal.getAnimations().forEach(a=>a.cancel());
        const pulse = reducedMotion() ? 'none' : 'scale(1.13)';
        foot.seal.animate([{transform:pulse,filter:'brightness(1.7)'},{transform:'none',filter:'brightness(1)'}],{duration:330});
      }
    },
    destroy() {
      observer.disconnect();
      for (const node of [front,floor]) {node.getAnimations({subtree:true}).forEach(a=>a.cancel());node.remove();}
    }
  };
}

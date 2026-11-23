import {Container, Graphics} from 'pixi.js';

// All six marks are drawn at the recipients' positions; casting never replaces
// a boss texture or changes its facing. The timeline supplies the single impact.
function mark(skill) {
  const shape = new Graphics();
  const color = skill.tint;
  const stroke = (width, alpha = 1) => shape.stroke({color, width, alpha, cap: 'round', join: 'round'});
  if (skill.boss === 'rahden') {
    if (skill.kind === 'seal') {
      for (const x of [-16, 16]) {
        shape.moveTo(x - 8, -48).lineTo(x + 8, -48).lineTo(x, 16).closePath().fill(color);
      }
      shape.moveTo(-34, -16).lineTo(34, -16); stroke(3);
    } else if (skill.kind === 'curse') {
      for (const radius of [16, 28, 40]) {
        shape.arc(0, -24, radius, .16, Math.PI - .16); stroke(3, 1 - radius / 88);
      }
    } else {
      shape.moveTo(-9,-77).lineTo(10,-70).lineTo(3,23).lineTo(-3,37).lineTo(-7,11).closePath().fill(color);
      shape.moveTo(-31,-48).lineTo(28,-42); stroke(5);
      shape.moveTo(-24,18).lineTo(-10,9).moveTo(14,11).lineTo(28,21); stroke(3);
    }
  } else {
    if (skill.kind === 'curse') {
      for (const y of [-24,-8,8]) {
        shape.moveTo(-39,y).bezierCurveTo(-15,y-24,15,y+22,39,y-4); stroke(3);
      }
    } else if (skill.kind === 'seal') {
      shape.ellipse(0,-15,40,15); stroke(3);
      shape.ellipse(0,-15,13,34); stroke(2);
      shape.circle(29,-27,5).fill(color);
    } else {
      shape.circle(0,-17,30); stroke(2);
      shape.moveTo(-35,25).lineTo(33,-60); stroke(5);
      shape.moveTo(-18,-18).lineTo(0,-23).lineTo(15,-18).lineTo(0,-12).closePath().fill(0xd5faff);
    }
  }
  return shape;
}

export function playKnightSigils(engine, skill, targets, impact) {
  const display = new Container();
  display.label = skill.code;
  display.eventMode = 'none';
  for (const target of targets) {
    const glyph = mark(skill);
    glyph.position.set(target.root.x, target.root.y - 68);
    display.addChild(glyph);
  }
  display.alpha = 0;
  engine.effectLayer.addChild(display);
  return engine.timeline(tl => {
    tl.to(display, {alpha: engine.reducedMotion ? .66 : .94, duration: .14}, 0);
    tl.call(impact, [], skill.impactAt);
    tl.to(display, {alpha: 0, duration: skill.duration - skill.impactAt}, skill.impactAt);
  }, () => display.destroy({children: true}), 1, {releaseAt: skill.duration});
}

"""Record manually inspected normalized SD attachment points; never edit art."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# code: weapon family, authored forward direction, weapon tip/core, casting hand, chest.
# Measured against the entire transparent PNG, not its cropped visible bounds.
POINTS = [
('BLADE',-1,.02,.94,.36,.63,.55,.53),
('GUN',1,.84,.78,.66,.68,.52,.53),
('SHIELD',1,.79,.62,.74,.57,.51,.50),
('GUN',-1,.19,.19,.36,.60,.51,.49),
('GUN',1,.97,.73,.73,.60,.52,.48),
('BLADE',-1,.03,.91,.34,.62,.53,.49),
('GUN',-1,.19,.86,.33,.65,.52,.51),
('GUN',1,.98,.15,.73,.47,.52,.48),
('GUN',1,.98,.70,.69,.56,.56,.51),
('BLADE',-1,.20,.98,.58,.62,.55,.49),
('BLADE',1,.94,.95,.55,.70,.48,.65),
('BLADE',-1,.12,.94,.40,.69,.54,.59),
('GUN',1,.85,.85,.60,.61,.50,.47),
('GUN',1,.98,.69,.70,.56,.56,.40),
('BLADE',1,.94,.54,.72,.36,.51,.52),
('MAGIC',1,.26,.25,.27,.31,.55,.50),
('SHIELD',1,.88,.51,.70,.53,.50,.45),
('MAGIC',1,.91,.37,.86,.44,.56,.49),
('BLADE',1,.98,.99,.71,.64,.51,.50),
('BLADE',-1,.30,.39,.27,.42,.49,.51),
('MAGIC',1,.15,.34,.16,.43,.47,.43),
('BOW',-1,.08,.56,.35,.48,.48,.42),
('BLADE',1,.88,.87,.74,.67,.50,.52),
('GUN',-1,.075,.345,.35,.44,.52,.43),
('GUN',-1,.025,.57,.36,.51,.51,.43),
('GUN',-1,.075,.55,.32,.51,.50,.43),
('GUN',-1,.05,.58,.36,.54,.52,.42),
('POLEARM',1,.90,.02,.69,.50,.51,.45),
('SHIELD',1,.81,.49,.73,.49,.47,.44),
('BLADE',1,.84,.76,.28,.53,.47,.42),
('BLADE',1,.58,.995,.56,.44,.51,.36),
('GUN',-1,.03,.44,.36,.52,.54,.41),
('GUN',-1,.15,.36,.27,.42,.53,.39),
('GUN',-1,.10,.375,.32,.44,.51,.41),
('GUN',-1,.055,.425,.39,.43,.53,.39),
('GUN',-1,.055,.025,.44,.47,.56,.43),
('GUN',-1,.025,.35,.32,.41,.53,.37),
('GAUNTLET',-1,.31,.33,.31,.33,.57,.38),
('BLADE',1,.96,.81,.40,.46,.54,.38),
('BOW',1,.81,.50,.76,.54,.49,.43),
('BLADE',-1,.40,.955,.195,.31,.54,.39),
('GUN',-1,.205,.73,.37,.53,.52,.39),
('GUN',-1,.185,.795,.305,.605,.51,.415),
]
roster=json.loads((ROOT/'assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json').read_text(encoding='utf-8'))
rows={}
for c,p in zip(roster['cards'],POINTS,strict=True):
    kind,facing,wx,wy,hx,hy,cx,cy=p
    rows[c['code']]={'battleSpriteSha256':c['battleSpriteSha256'],'weaponKind':kind,'authoredFacing':facing,
        'weapon':{'x':wx,'y':wy},'cast':{'x':hx,'y':hy},'contact':{'x':cx,'y':cy}}
target=ROOT/'assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json'
target.write_text(json.dumps({'version':1,'coordinateSpace':'FULL_TEXTURE_NORMALIZED','status':'TECH_QA_USER_REVIEW_PENDING',
    'measuredAt':'2026-09-13','affectsSkillAssignments':False,'cards':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Recorded {len(rows)} immutable-art attachment maps.')

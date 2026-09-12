"""Measure existing licensed recordings. Writes metadata only; no new/synthetic audio."""
import hashlib, json, subprocess
from pathlib import Path
import imageio_ffmpeg
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
event=json.loads((ROOT/'preview/project-v-v3-event-fx-v1/assets/audio/manifest.json').read_text(encoding='utf-8'))
guns=json.loads((ROOT/'preview/project-v-v3/assets/audio/firearm-qc-v1/manifest.json').read_text(encoding='utf-8'))
assets={}
for key,row in event['assets'].items():
    assets[key]={'url':'/preview/project-v-v3-event-fx-v1/'+row['src'],'license':event['license'],'licenseUrl':event['licenseUrl'],
        'sources':{str(i):event['sources'][str(i)] for i in row['sourceIds']},'provenance':'/preview/project-v-v3-event-fx-v1/assets/audio/manifest.json'}
for name,needle in [('rifle','m4a1-colt'),('automatic','ak47-shot'),('sniper','m200-tac50')]:
    row=next(r for r in guns['profiles'].values() if needle in r['asset'])
    assets[name]={'url':row['asset'],'license':row['source']['license'],'licenseUrl':row['source']['licenseUrl'],
        'sources':[row['source']],'provenance':'/preview/project-v-v3/assets/audio/firearm-qc-v1/manifest.json'}
for key,row in assets.items():
    p=ROOT/row['url'].lstrip('/')
    pcm=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(p),'-f','f32le','-ar','48000','-ac','2','pipe:1'],capture_output=True,check=True).stdout
    wave=np.frombuffer(pcm,dtype='<f4').reshape(-1,2); amplitude=np.max(np.abs(wave),axis=1); peak=int(np.argmax(amplitude))
    row.update(sha256=hashlib.sha256(p.read_bytes()).hexdigest(),sampleRate=48000,duration=len(wave)/48000,peak=peak/48000,peakAmplitude=float(amplitude[peak]))
profiles={
 'MS-021':('ultimate',['critical','boss-ultimate'],[.30,.38],'검풍 → 중량 검격 → 붕괴 잔향'),
 'MS-003':('counter',['counter'],[.27],'방패 전개 → 둔중 금속 충돌 → 방벽 잔향'),
 'MS-004':('rifle',['sniper'],[.28],'기계 준비 → 단발 저격 → 실외 잔향'),
 'MS-006':('dodge',['critical','counter'],[.31,.22],'무거운 검풍 → 파쇄 → 금속 균열'),
 'MS-005':('rifle',['rifle','rifle','automatic'],[.20,.22,.29],'조준 준비 → 세 번의 점사 → 짧은 탄착 잔향'),
 'MS-013':('ultimate',['ultimate','rifle','rifle'],[.19,.16,.16],'명령 압력 → 아군 전파 → 다음 사격 보강'),
 'MS-015':('dodge',['critical','revive'],[.24,.21],'침투 검풍 → 단검 접촉 → 액체성 독 잔향'),
 'MS-016':('ultimate',['ultimate'],[.24],'역방향 흡입 → 봉인 파동 → 낮은 마력 잔향'),
 'MS-018':('revive',['revive','revive'],[.16,.23],'물결 준비 → 정화 → 봉합 회복의 물성'),
 'MS-023':('dodge',['counter','critical'],[.24,.31],'방어 검풍 → 금속 받아내기 → 응수 검격'),
 'MS-025':('sniper',['sniper'],[.32],'절제된 기계 준비 → 굵은 단발 → 긴 실총 잔향'),
 'MS-027':('automatic',['automatic','automatic','automatic'],[.22,.22,.26],'사격 준비 → 교차 점사 → 탄착과 반사음'),
 'MS-028':('revive',['revive'],[.23],'물결 전개 → 연화 방호 → 부드러운 확산'),
 'MS-032':('automatic',['automatic'],[.32],'약실 준비 → 강한 단발 → 짧은 재장전 여운'),
 'MS-038':('dodge',['critical'],[.34],'근접 공기 파열 → 둔중 충격 → 지면 잔향'),
 'MS-042':('rifle',['rifle','counter'],[.23,.18],'권총 준비 → 제압탄 → 구속 금속음'),
 'MS-043':('rifle',['automatic','rifle'],[.22,.30],'짧은 준비 → 첫 탄 → 무게가 다른 둘째 탄'),
}
doc={'version':1,'status':'TECH_QA_USER_REVIEW_PENDING','runtimeEnabled':False,'sourceType':'EXISTING_LICENSED_RECORDINGS',
 'proceduralSynthesis':False,'newRecordings':0,'sampleRate':48000,'impactToleranceMs':20,
 'processing':'원본 MP3 무변경. Web Audio에서 구간 선택, 이득, 페이드, 좌우 패닝과 공용 GSAP 배속만 적용. PCM 전역 최대 피크를 충돌에 정렬.',
 'assets':assets,'profiles':{key:{'notice':n,'impacts':imp,'gains':g,'design':d} for key,(n,imp,g,d) in profiles.items()}}
target=ROOT/'preview/project-v-mercenary-system-v1/skill-audio-v1.json'
target.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Measured {len(assets)} preserved recordings, prepared {len(profiles)} layered profiles.')

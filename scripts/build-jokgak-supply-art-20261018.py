"""Package built-in ImageGen originals; only atlas extraction and web resizing."""
from pathlib import Path
from PIL import Image
import hashlib, json, shutil
root = Path(__file__).resolve().parents[1]
out = root / 'assets/ui/jokgak-city/supply-20261018'
source = Path('C:/Users/User/.codex/generated_images/01a14a2c-e98a-7293-9d19-fc8f4c4b0c95')
files = {'groza':'exec-52ea2f48-5aaf-4c64-a96a-6496bac4a69e.png', 'golden-aks':'exec-fcc980b9-bd43-4c52-a3da-20b743f0e30f.png', 'supply-crate':'exec-2c15783f-66b9-4b00-a40f-0077f4417def.png', 'supply-ui':'exec-e56b40b3-8a57-4e2d-8ded-b75ed836fd39.png'}
out.mkdir(parents=True, exist_ok=True)
for key, file in files.items():
    original = out / (key+'-source.png')
    if not original.exists(): shutil.copyfile(source/file, original)
    if key != 'supply-ui':
        img = Image.open(original).convert('RGBA')
        for size in [768,256]:
            img.resize((size,size),Image.Resampling.LANCZOS).save(out/(key+'-'+str(size)+'.webp'),quality=94,method=6)
atlas=Image.open(out/'supply-ui-source.png').convert('RGBA')
crops={'panel':(52,20,1484,520),'news':(72,552,1467,752),'button':(337,793,1200,1005)}
for key,box in crops.items(): atlas.crop(box).save(out/(key+'.webp'),quality=95,method=6)
rows=[]
for p in sorted(out.iterdir()):
    if p.suffix not in ['.png','.webp']: continue
    im=Image.open(p)
    rows.append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'width':im.width,'height':im.height,'mode':im.mode,'bytes':p.stat().st_size})
(out/'manifest.json').write_text(json.dumps({'date':'2026-10-18','generator':'built-in image_gen','prompts':'prompts.json','references':[], 'originalsPreserved':True,'derivatives':'Lossy WebP resize and rectangular atlas extraction only; no repaint or shape change.','atlasCrops':crops,'usedBy':['js/jokgak-city-supply-ui-v1.mjs','js/jokgak-city-exploration-ui-v2.mjs','css/jokgak-city-supply-v1.css'],'visualApproval':'Technical QA only; not user visual approval','assets':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files':len(rows),'bytes':sum(r['bytes'] for r in rows)}))

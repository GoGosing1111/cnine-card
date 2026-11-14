from pathlib import Path
import json, hashlib, zipfile
from PIL import Image, ImageChops, ImageStat
from datetime import datetime, timezone

root=Path(__file__).resolve().parents[2]
out=root/'output/newspapers/clan-season-4-20261114'
ops=Path(__file__).resolve().parent
qa=ops/'qa'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
facts=read(out/'facts.json');layout=read(qa/'layout.json');performance=read(qa/'performance.json');pdf=read(qa/'pdf.json')
assert len(layout['results'])==12 and not layout['errors']
for x in layout['results']:
    if x['type']=='desktop':
        assert x['width']==1200 and x['height']==2180 and not x['bodyOverflow'] and not x['images']
        assert x['footerBottom']<=x['paperBottom']-29
    else: assert not x['overflow'] and int(x['page'])==int(x['select'])
assert facts['totals']['completedBattles']==21564 and facts['checks']['allThirtyScoresVerified'] and facts['checks']['finalTimelineVerified']
performance['conditions']['baseline']='Same article/layout, original source PNG, full TTF fonts, eager loading of every page image.'
performance['conditions']['optimized']='WebP cover; WOFF2 font subsets with renamed internal families; hidden images deferred and selected-page images loaded immediately.'
performance['conditions']['readyDefinition']='Navigation invocation through document load, local fonts, viewport-visible image decode and two paint frames; controls installed.'
performance['findings']={
    'resourceReduction':'Initial requested local file bytes fell from 5,047,330 to 666,137 (86.8%); requests from 15 to 6.',
    'bottleneck':'The offline reader has no server/network wait. Full Korean font and source illustration loading/decoding, plus browser-scheduled lazy image loading on first page change, were the avoidable costs addressed.',
    'timingLimit':'Local cold/reentry timings varied. Do not claim a general first-entry speedup: desktop first navigation 321.6→340.3 ms and reentry 85.5→105.1 ms; mobile emulation 310.8→290.9 ms and 90.1→99.5 ms.',
    'interaction':'Selected-page eager image loading reduced the observed first switch from 174.9/228.9 ms to 93.0/106.1 ms (desktop/mobile emulation in sequential runs). No main-thread long tasks were recorded; mobile had one >50 ms frame during first switching/loading.',
    'exit':'No application intervals, timeouts or RAF loops scheduled. After navigating away, script duration increase was 0 ms over the sampled 500 ms.'
}
(qa/'performance.json').write_text(json.dumps(performance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary={
    'edition':facts['edition'],'published':facts['published'],'snapshotAt':facts['snapshotAt'],'pageCount':6,'pagePixels':[1800,3270],
    'mainHeadline':'FM, 돌아온 왕관을 다시 겹쳐 쓰다','regularChampion':'FM','championsWinner':'FM','finalScore':'FM 1235 : 한화 1134',
    'verification':{'data':facts['checks'],'desktopPages':6,'mobilePages':6,'physicalDevice':'Windows host, installed Chrome headless','mobile':'390×844 viewport/touch emulation; no real phone test','overflowOrMissingImageCount':0,'browserErrors':[],'pdf':pdf,'visualReview':'All six final PDF pages rendered by Poppler and inspected; desktop and mobile page captures inspected.'},
    'performance':{'conditions':performance['conditions'],'summary':performance['summary'],'interactions':performance['interactions'],'findings':performance['findings']},
    'art':{'mode':'built-in image_gen','promptFile':'prompts.json','sourceSha256':hashlib.sha256((ops/'fm-double-crown-source.png').read_bytes()).hexdigest(),'webAsset':'assets/fm-double-crown.webp','originalPreserved':True},
    'scope':'Standalone newspaper. No production database writes, reward delivery, game settings or public publishing.',
    'files':[]
}
for file in sorted(out.rglob('*')):
    if not file.is_file() or file.name=='manifest.json':continue
    entry={'file':file.relative_to(out).as_posix(),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    if file.suffix.lower() in ['.png','.webp']:
        with Image.open(file) as im:entry['pixels']=list(im.size)
    summary['files'].append(entry)
(out/'manifest.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
zip_path=out.parent/'리버스콜_클랜_시즌4_뉴스_전체.zip'
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for file in sorted(out.rglob('*')):
        if file.is_file():z.write(file,arcname='clan-season-4/'+file.relative_to(out).as_posix())
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    assert len([f for f in z.namelist() if '/pages/' in f and f.endswith('.png')])==6
    assert len([f for f in z.namelist() if f.endswith('.pdf')])==1
completion={'completedAt':datetime.now(timezone.utc).isoformat(),'edition':facts['edition'],'folder':out.relative_to(root).as_posix(),'pdf':'output/newspapers/clan-season-4-20261114/리버스콜_클랜_시즌4_뉴스.pdf','zip':zip_path.relative_to(root).as_posix(),'zipBytes':zip_path.stat().st_size,'zipSha256':hashlib.sha256(zip_path.read_bytes()).hexdigest(),'checks':summary['verification'],'performance':summary['performance'],'scope':summary['scope']}
doc=root/'docs/qa/clan-season4-newspaper-20261114';doc.mkdir(parents=True,exist_ok=True)
(doc/'completion.json').write_text(json.dumps(completion,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pdfBytes':pdf['bytes'],'zipBytes':completion['zipBytes'],'files':len(summary['files'])+1,'pages':6,'checks':'passed'},ensure_ascii=False))

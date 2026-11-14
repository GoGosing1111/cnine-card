from pathlib import Path
from html.parser import HTMLParser
from html import unescape
from fontTools import subset
from fontTools.ttLib import TTFont
import json

root=Path(__file__).resolve().parents[2]
out=root/'output/newspapers/clan-season-4-20261114'
class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self,data): self.parts.append(data)
p=Text();p.feed((out/'index.html').read_text(encoding='utf-8'))
chars=unescape(''.join(p.parts))+'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz→←↓↔+-%.,:()[]/ '
metrics=[]
for src,dst,family in [('BlackHanSans-Regular.ttf','ReverseCallNewsDisplay.woff2','ReverseCallNewsDisplay'),('IBMPlexMono-Medium.ttf','ReverseCallNewsMono.woff2','ReverseCallNewsMono')]:
    font=TTFont(out/'assets/fonts'/src)
    options=subset.Options()
    options.flavor='woff2'
    sub=subset.Subsetter(options=options);sub.populate(text=chars);sub.subset(font)
    for name_id in [1,2,3,4,6,16,17]:
        for record in list(font['name'].names):
            if record.nameID==name_id:
                value='Regular' if name_id in [2,17] else family
                font['name'].setName(value,name_id,record.platformID,record.platEncID,record.langID)
    font.flavor='woff2';font.save(out/'assets/fonts'/dst)
    metrics.append({'source':src,'sourceBytes':(out/'assets/fonts'/src).stat().st_size,'subset':dst,'subsetBytes':(out/'assets/fonts'/dst).stat().st_size,'glyphs':len(font.getGlyphOrder())})
css=(out/'news.css').read_text(encoding='utf-8')
css=css.replace('BlackHanSans-Regular.ttf','ReverseCallNewsDisplay.woff2').replace('IBMPlexMono-Medium.ttf','ReverseCallNewsMono.woff2').replace("format('truetype')","format('woff2')")
(out/'news.css').write_text(css,encoding='utf-8')
(Path(__file__).resolve().parent/'qa/font-optimization.json').write_text(json.dumps(metrics,indent=2)+'\n',encoding='utf-8')
sources=(out/'sources.txt').read_text(encoding='utf-8')
sources+='\n읽기 성능: 본문에 쓰이는 글자만 포함한 WOFF2 파생 글꼴 ReverseCallNewsDisplay / ReverseCallNewsMono를 사용한다. 원 글꼴과 SIL OFL을 함께 보존하며 파생 글꼴 내부 이름을 변경했다. 페이지를 선택하면 그 지면의 이미지를 즉시 로드하고, 숨긴 지면에는 주기 갱신을 두지 않는다.\n'
(out/'sources.txt').write_text(sources,encoding='utf-8')
print(json.dumps(metrics))

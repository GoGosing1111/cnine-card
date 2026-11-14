from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
from PIL import Image

root=Path(__file__).resolve().parents[2]
out=root/'output/newspapers/clan-season-4-20261114'
qa=Path(__file__).resolve().parent/'qa'
pdf=out/'리버스콜_클랜_시즌4_뉴스.pdf'
names=['01-front','02-champions','03-regular-season','04-players','05-club-reviews','06-legacy']
titles=['종합 - FM의 통합 우승','챔피언스리그 - 마지막 10분','정규시즌 - 순위와 승부처','선수 분석 - 숫자로 남은 이름','클랜별 결산 - 여덟 개의 시즌','기록과 다음 장 - 다시 출발선']
c=canvas.Canvas(str(pdf),pagesize=(600,1090),pageCompression=1)
c.setTitle('리버스콜 스포츠 · 클랜 시즌 4 결산 특별판')
c.setAuthor('리버스콜 스포츠')
c.setSubject('시즌 4 공식 완료 기록을 바탕으로 만든 6면 신문. 기사 전문은 동봉한 텍스트 파일에 있습니다.')
for name,title in zip(names,titles):
    image=out/'pages'/f'{name}.png'
    with Image.open(image) as im:
        assert im.size==(1800,3270),(name,im.size)
    c.bookmarkPage(name)
    c.addOutlineEntry(title,name,level=0)
    c.drawImage(ImageReader(str(image)),0,0,width=600,height=1090,mask='auto')
    c.showPage()
c.save()
r=PdfReader(pdf)
assert len(r.pages)==6
for p in r.pages:
    assert float(p.mediabox.width)==600 and float(p.mediabox.height)==1090
    assert len(p.images)==1
report={'pages':len(r.pages),'pageSizePoints':[600,1090],'pagePixels':[1800,3270],'imageDpi':216,'format':'High-resolution newspaper facsimile; separate article text included','bytes':pdf.stat().st_size,'bookmarks':6}
(qa/'pdf.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))

from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = r"assets/posters/territory-war-v3-round11-bg.png"
OUT = r"assets/posters/territory-war-v3-round11-news.png"
BOLD = r"C:/Windows/Fonts/NANUMGOTHICEXTRABOLD.TTF"
REGULAR = r"C:/Windows/Fonts/NotoSansKR-VF.ttf"

im = Image.open(SRC).convert("RGBA")
w, h = im.size
draw = ImageDraw.Draw(im)

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REGULAR, size)

def center(text, y, f, fill, stroke=0, stroke_fill=(0, 0, 0, 220)):
    box = draw.textbbox((0, 0), text, font=f, stroke_width=stroke)
    x = (w - (box[2] - box[0])) // 2
    draw.text((x, y), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)

gold = (245, 204, 104, 255)
ivory = (244, 240, 222, 255)
muted = (174, 192, 207, 255)
cyan = (92, 222, 255, 255)
red = (255, 105, 105, 255)

# Header
center("전 장 특 보  ·  제11회", 28, font(24, True), gold)
center("역전의 역전, 오피팀이 끝냈다", 61, font(48, True), ivory, 2)
center("숲켓몬 영토전 V3  |  가좌동 전선", 123, font(20, True), muted)
draw.rounded_rectangle((310, 160, 812, 192), radius=16, fill=(130, 91, 21, 210), outline=gold, width=1)
center("오피팀(A) 37  :  33 B팀  ·  판정승", 164, font(18, True), (255, 244, 204, 255))

# Breaking-news milestones over the battlefield
cards = [
    (42, 278, 326, 374, "06:57", "B팀 최후 방어", "오피팀 진격을 밀어내다", cyan),
    (390, 530, 732, 633, "12:22", "오피팀 최후 방어", "A 전초기지서 대반격 시작", gold),
    (748, 744, 1080, 865, "15:24 → 15:50", "B팀 본진 진입", "오피팀, 끝내 판정승", red),
]
for x1, y1, x2, y2, time, title, body, accent in cards:
    draw.rounded_rectangle((x1, y1, x2, y2), radius=12, fill=(4, 13, 24, 218), outline=accent, width=2)
    draw.text((x1 + 16, y1 + 11), time, font=font(17, True), fill=accent)
    draw.text((x1 + 16, y1 + 38), title, font=font(21, True), fill=ivory)
    draw.text((x1 + 16, y1 + 68), body, font=font(14), fill=muted)

# Stats panel
stats = [
    ("15시간 37분", "전투 지속"),
    ("70개 전선", "승패 확정"),
    ("20,235회", "총 교전"),
    ("150명", "75 : 75 참전"),
]
cell_w = (w - 58) // 4
for i, (value, label) in enumerate(stats):
    x = 29 + i * cell_w
    cx = x + cell_w // 2
    box = draw.textbbox((0, 0), value, font=font(25, True))
    draw.text((cx - (box[2] - box[0]) // 2, 1057), value, font=font(25, True), fill=ivory)
    box = draw.textbbox((0, 0), label, font=font(15, True))
    draw.text((cx - (box[2] - box[0]) // 2, 1100), label, font=font(15, True), fill=gold)

# Main statistical lede
center("한때 A 전초기지까지 밀린 오피팀", 1160, font(22, True), muted)
center("최후 방어 후 중앙을 되찾고 B 본진까지 역진격", 1194, font(25, True), ivory)
center("총 피해  A 28,001,292  |  B 28,055,797", 1241, font(17, True), (205, 215, 222, 255))

# Closing ribbon
center("오 피 팀   승 리", 1320, font(38, True), gold, 2)
center("피해량 열세를 전선 승리로 뒤집은 제11회 전장의 주인공", 1368, font(16, True), ivory)

im.convert("RGB").save(OUT, quality=95)
print(OUT)

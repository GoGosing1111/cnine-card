const ROOT = '/assets/ui/reverse-call/world-story-v2/';

export const EXPANSION_CHAPTERS = Object.freeze([
  {id:'answered-contract',label:'CHAPTER 03',title:'호출에 응답한 자들',description:'베스페라와 아잔트가 추적하는, 명부에 없는 의뢰인.',start:'outpost-brief',art:'outpost'},
  {id:'three-fronts',label:'CHAPTER 04',title:'세 갈래의 전선',description:'오르제·렌조·제노의 전장에서 드러나는 하나의 신호.',start:'gravity-front',art:'frontier'},
  {id:'frozen-names',label:'CHAPTER 05',title:'얼음에 갇힌 이름',description:'크라이베른과 정벌대가 마주한 이스겐의 구원.',start:'frozen-names',art:'frozen-archive'},
  {id:'last-order',label:'CHAPTER 06',title:'끝나지 않은 명령',description:'바르센의 전장, 발테르의 방벽, 헬리오스가 비추는 귀환로.',start:'war-repeats',art:'varsen'},
  {id:'unerasable-record',label:'CHAPTER 07',title:'코어가 지우지 못한 것',description:'세드릭의 판결 앞에서, 되찾은 사람들을 다시 선택하다.',start:'core-judgment',art:'core-observatory'}
]);

export const EXPANSION_ART = Object.freeze(Object.fromEntries([
  'outpost','frontier','frozen-archive','core-observatory','orze','renzo','zeno','isgen','varsen','cedric','valter','helios'
].map(id=>[id,ROOT+id+'.webp'])));

export const EXPANSION_CHARACTERS = Object.freeze({
  vespera:{name:'베스페라',code:'V-004',image:ROOT+'vespera-bust.webp',alt:'금테 안경과 붉은 코트, 검은 머리의 저격수 베스페라 상반신'},
  berkan:{name:'베르칸',code:'V-055',image:ROOT+'berkan-bust.webp',alt:'흑금 갑옷과 장궁을 갖춘 궁수 베르칸 상반신'},
  azant:{name:'아잔트',code:'V-056',image:ROOT+'azant-bust.webp',alt:'청옥 지팡이와 은색 투구, 검은 갑옷의 마법사 아잔트 상반신'},
  cryvern:{name:'크라이베른',code:'V-049',image:ROOT+'cryvern-bust.webp',alt:'푸른 결정 쌍검과 은빛 갑옷을 갖춘 크라이베른 상반신'}
});

// Names, equipment and encounter motifs come from the current game catalog.
// The connections and events below are authored story, not gameplay unlocks.
export const STORY_REFERENCES = Object.freeze({
  mercenaries:['V-004','V-042','V-049','V-051','V-055','V-056','V-057','V-996','V-999','V-989','V-979'],
  bosses:['raid-004-orthen','raid-006-haeryun','raid-008-noaren','raid-lich-nivar','raid-madara-vaelun','raid-core-astel'],
  encounters:['월드 레이드','정벌대 · 봉인대 · 구출대','코어 동조 · 회로 복원 · 차폐 구역']
});

export const EXPANSION_SCENES = Object.freeze([
  {id:'outpost-brief',chapter:3,art:'outpost',character:'vespera',speaker:'베스페라',location:'폐선 관제실 · 용병 연락소',title:'의뢰서에는 세 사람의 자리가 있었다.',paragraphs:[
    '베스페라는 빈 의뢰서를 창가에 비추었다. 종이에는 당신의 서명, 돌아온 동생의 지문, 그리고 누군가 펜을 눌렀던 자국이 남아 있었다.',
    '“기록이 지워졌다고, 일어나지 않은 일이 되지는 않아.” 그녀는 세 번째 자리를 손끝으로 짚었다.',
    '각기 다른 전장에서 돌아온 용병들이 이곳에 모이는 이유도 같았다. 누구에게나 현재의 명부로는 설명할 수 없는 과거가 하나씩 있었다.'
  ]},
  {id:'witness-signature',chapter:3,art:'outpost',location:'연락소 · 실종자 기록',title:'없는 사람의 실종 신고.',paragraphs:[
    '경찰 조은이 가져온 조회 결과에는 의뢰인의 출생도, 거주지도 없었다. 동생은 누나의 얼굴을 설명하려다가 말을 잃었다. 손바닥에는 누나가 접어 준 승차권의 주름만 선명했다.',
    '조은은 신고서를 버리지 않았다. 피해자 이름 칸을 비워 두고, 당신에게 목격자 서명을 받았다.',
    '“이름을 찾으면 채우죠. 빈칸까지 없앨 이유는 없으니까요.”'
  ]},
  {id:'crystal-record',chapter:3,art:'outpost',character:'azant',speaker:'아잔트',location:'연락소 · 결정 기록대',title:'한 장의 승차권, 세 개의 전장.',paragraphs:[
    '아잔트의 지팡이 끝에서 푸른 결정이 벌어졌다. 승차권을 통과한 빛은 도시 지도가 아니라, 서로 다른 세 하늘을 비추었다.',
    '뒤틀린 중력 아래의 오르제. 붉은 불길을 가르는 렌조. 검은 경계 너머의 제노. 월드 레이드에서 되풀이해 관측되던 전장들이었다.',
    '“같은 목소리가 세 곳에서 들린다. 살아 있는 사람이 이동했다면 남길 수 없는 순서다.”'
  ]},
  {id:'departure-name',chapter:3,art:'frontier',character:'vespera',speaker:'베스페라',location:'새벽 · 출발선',title:'용병은, 호출을 받아들인 사람.',paragraphs:[
    '베스페라는 당신에게 새 카드를 건넸다. 이름을 대신 적어 주거나, 충성을 맹세하게 하지는 않았다. 카드가 붙잡는 것은 명령이 아니라 서로 응답한 흔적이라고 했다.',
    '“누구를 구할지, 어디서 멈출지는 네가 정해. 우리는 그 길이 끊어지지 않게 할 테니.”',
    '당신은 빈 의뢰서를 접어 넣었다. 이번 원정의 목적은 보스를 쓰러뜨린 뒤에도 남을 것이었다. 돌아올 사람들의 자리를 지우지 않는 것.'
  ]},
  {id:'gravity-front',chapter:4,art:'orze',position:'50% 0%',location:'월드 레이드 · 오르제의 전장',title:'무너지는 것은 건물만이 아니었다.',paragraphs:[
    '오르제가 손을 들자 부서진 교량이 하늘로 끌려 올라갔다. 아래로 떨어져야 할 돌들이 머리 위에서 도시의 옛 윤곽을 만들었다.',
    '교량 끝의 대피 표지판은 같은 방향을 가리키면서도 다른 거리 이름을 보여 주었다. 어느 역사를 따라가느냐에 따라, 같은 걸음이 다른 낭떠러지로 이어졌다.',
    '그 중심에서 승차권이 떨렸다. 의뢰인의 목소리는 구조를 요청하는 대신, 누군가에게 대피 순서를 알려 주고 있었다.'
  ]},
  {id:'gilded-anchor',chapter:4,art:'frontier',character:'berkan',speaker:'베르칸',location:'부서진 고가교 · 후방 고정점',title:'표적보다 먼저, 돌아올 길을 본다.',paragraphs:[
    '베르칸은 오르제를 향해 곧장 활을 들지 않았다. 교량 뒤편에서 붕괴를 붙잡고 있는 두 지점을 골랐다. 흑금 낙성의 화살이 갈라져 날아가자, 잠깐이나마 바닥이 수평을 되찾았다.',
    '“지금 건너라. 무너뜨리는 건 그다음이다.”',
    '당신은 그 짧은 틈에 대피소의 기록함을 꺼냈다. 안에는 서명이 없는 배차표가 있었다. 마지막 열차의 목적지는 역 이름 대신 빈 사각형으로 남아 있었다.'
  ]},
  {id:'ember-crossing',chapter:4,art:'renzo',position:'50% 40%',location:'월드 레이드 · 렌조의 전장',title:'멈추지 않는 해질녘.',paragraphs:[
    '렌조가 지키는 길은 같은 황혼으로 돌아갔다. 돌계단의 그을음, 끊어진 난간, 검이 지나간 불빛까지, 한 번의 전투가 지워진 뒤 다시 시작되고 있었다.',
    '“끝나지 않은 것은 싸움인가, 명령인가.” 당신의 물음에 돌아온 것은 검격이었다. 베르칸이 퇴로를 잡는 동안, 당신은 매번 불길이 삼키는 종루 아래로 들어갔다.',
    '그곳의 안내 방송은 오르제의 전장에서 들은 목소리와 같았다. 배차표의 빈 목적지에, 서리처럼 희미한 획 하나가 생겼다.'
  ]},
  {id:'black-tide',chapter:4,art:'zeno',position:'50% 55%',location:'월드 레이드 · 제노의 전장',title:'검은 경계는 목소리를 잘라 낸다.',paragraphs:[
    '제노가 검을 휘두를 때마다 호출이 한 음절씩 끊겼다. 이곳에서는 사람의 그림자가 먼저 경계를 넘어가고, 몸은 뒤늦게 그 자리를 잊었다.',
    '당신은 무전기를 켜지 않고 승차권을 손에 쥐었다. 소리보다 오래 남는 종이의 주름을 따라, 잘려 나간 방송의 순서를 맞추었다.',
    '세 전장에 흩어진 말이 처음으로 이어졌다. “환승객은… 북쪽 왕좌로. 아직 이름이 남아 있는 분부터.”'
  ]},
  {id:'three-fronts',chapter:4,art:'frontier',character:'berkan',speaker:'베르칸',location:'세 전선의 합류점',title:'승리한 자리에도, 전장은 남는다.',paragraphs:[
    '전장의 중심이 잠잠해져도 균열은 완전히 닫히지 않았다. 사람 하나의 이름보다 훨씬 큰 역사가 그 안에 걸려 있었다. 다음 레이드가 필요한 이유를 당신은 이제 조금 알 것 같았다.',
    '베르칸은 망가진 화살촉을 거두며 북쪽을 보았다. “오늘 열어 둔 길을 다음 사람들이 쓰면 된다. 한 번에 세상을 끝내려 들지 마라.”',
    '아잔트가 배차표의 세 흔적을 겹쳤다. 얼어붙은 왕좌가 나타났다. 그 아래에는 돌아오지 못한 승객들의 명부가 있었다.'
  ]},
  {id:'frozen-names',chapter:5,art:'frozen-archive',character:'cryvern',speaker:'크라이베른',location:'북부 성채 · 얼어붙은 기록고',title:'이 얼음은 죽음을 막고 있었다.',paragraphs:[
    '크라이베른이 쌍검 중 하나를 벽에 대었다. 푸른 날이 얼음 속의 가느다란 빛과 맞닿자, 수많은 이름이 한꺼번에 떨렸다.',
    '“아직 깨지 마라.” 그가 당신의 손을 막았다. “감옥이지만, 지금은 이들의 몸이기도 하다.”',
    '기둥 안에는 사라진 도시의 사람들이 잠들어 있었다. 이스겐은 그들을 없애지 않았다. 대신, 어떤 내일도 오지 않는 곳에 보존했다.'
  ]},
  {id:'throne-offer',chapter:5,art:'isgen',position:'50% 0%',location:'이스겐 정벌 · 저주받은 왕좌',title:'“여기서는, 아무도 잊히지 않는다.”',paragraphs:[
    '왕좌의 주인은 당신이 찾는 의뢰인을 알고 있었다. 마지막 열차를 타고 온 여자는 동생을 먼저 보내 달라고 부탁했으며, 그 뒤로도 남은 승객들의 호출을 이어 주었다고 했다.',
    '이스겐은 비어 있는 얼음 기둥을 보여 주었다. 돌아오겠다는 약속을 믿는 대신, 영원히 잃지 않는 쪽을 택하라는 제안이었다.',
    '당신의 카드에서 동생의 목소리가 들렸다. 그는 누나의 이름을 여전히 기억하지 못했다. 그래도 집의 문은 잠그지 않았다고 했다.'
  ]},
  {id:'three-companies',chapter:5,art:'frozen-archive',character:'cryvern',speaker:'크라이베른',location:'왕좌 공략 · 정벌대 / 봉인대 / 구출대',title:'한 명이 세 역할을 할 수는 없다.',paragraphs:[
    '정벌대가 왕좌의 압력을 받아 내는 동안 봉인대는 달·가시·왕관의 흔적을 읽었다. 구출대가 얼음 속 사람을 옮기기도 전에 봉인을 부수면, 구할 이름부터 흩어졌다.',
    '디임간호사는 구조한 사람의 호흡을 확인하며 들것 순서를 바꾸었다. 크라이베른은 출구를 막는 얼음을 잘라 내되, 아직 사람이 든 기둥에는 검을 대지 않았다.',
    '“왕을 쓰러뜨리는 것과 사람을 데려오는 것은 다른 일이다. 둘 다 끝내고 돌아간다.”'
  ]},
  {id:'rescue-ledger',chapter:5,art:'frozen-archive',location:'얼음 기둥 사이 · 마지막 승객 명부',title:'누나는 먼저 내리지 않았다.',paragraphs:[
    '당신은 명부의 끝에서 낯익은 필압을 발견했다. 의뢰서의 빈 서명 칸과 같은 자국이었다. 여자는 열차의 방향이 뒤집힐 때마다, 누군가 자기 목소리를 듣고 찾아오도록 방송을 남겼다.',
    '동생을 구한 순간 누나가 대가로 사라진 것은 아니었다. 그녀는 처음부터 경계 건너편에 있었다. 당신에게 닿았던 의뢰인은, 그녀가 힘겹게 내보낸 호출의 모습이었다.',
    '그 사실을 알아도 가벼워지지는 않았다. 명부에는 그녀가 얼음 왕좌를 떠나 검은 전장으로 이송되었다는 기록이 이어져 있었다.'
  ]},
  {id:'cold-escape',chapter:5,art:'frozen-archive',character:'azant',speaker:'아잔트',location:'북부 성채 · 봉인 밖',title:'기억을 옮기는 일.',paragraphs:[
    '아잔트는 왕좌의 얼음을 통째로 가져오지 않았다. 구조된 사람들이 서로의 이름을 부를 때마다, 결정 안의 빛을 하나씩 밖으로 옮겼다.',
    '“저장된 것만으로는 돌아온 게 아니다. 누군가 대답해야 한다.”',
    '이스겐의 힘이 약해진 틈에 첫 번째 구조대가 성채를 빠져나왔다. 남은 기둥은 봉인대가 지켰다. 당신은 모든 문을 닫고 떠나는 승리 대신, 다시 올 길을 남겼다.'
  ]},
  {id:'war-repeats',chapter:6,art:'varsen',position:'50% 45%',location:'바르센 레이드 · 검은 전장',title:'후퇴 명령이 도착하지 않은 군대.',paragraphs:[
    '검은 전장에는 이미 끝난 전쟁의 명령이 계속 내려오고 있었다. 바르센의 군세는 점령할 도시가 사라진 뒤에도 전진했고, 피난 열차는 전선을 통과할 때마다 적의 수송대로 분류되었다.',
    '승차권의 주파수를 따라가자, 명령을 중계하는 깃발 아래에서 민간인의 호출이 새어 나왔다.',
    '바르센은 당신이 가져온 종전을 인정하지 않았다. 그가 지키는 역사에는, 아직 누구도 패배를 선언한 적이 없었다.'
  ]},
  {id:'broken-orders',chapter:6,art:'frontier',character:'berkan',speaker:'베르칸',location:'검은 전장 · 명령 중계선',title:'사람을 향하지 않는 화살.',paragraphs:[
    '신궁 강윤의 연환 파갑이 군세 뒤편으로 뻗었다. 끊임없이 재생되는 선두 대신, 같은 명령을 되풀이하는 중계 지점을 꿰뚫는 사격이었다.',
    '베르칸은 그 틈을 넓혀 열차 쪽의 포화를 끊었다. 두 궁수의 표적은 달랐지만, 화살 사이에는 사람이 지나갈 수 있는 길이 생겼다.',
    '“지금이다.” 당신은 칼을 든 그림자가 아니라, 창문 안에서 흔들리는 손을 보고 달렸다.'
  ]},
  {id:'unbroken-line',chapter:6,art:'valter',position:'50% 0%',location:'귀환 열차 · 방어선',title:'발테르는 마지막 객차 앞에 섰다.',paragraphs:[
    '바르센의 압력이 다시 밀려왔을 때, 발테르는 뒤로 물러나지 않았다. 방벽 너머에서는 구출대가 객차마다 사람이 남았는지 확인하고 있었다.',
    '“아직 한 칸 남았다.” 무전 너머의 말에 그는 대답 대신 자세를 낮추었다. 갑옷의 광휘가 꺼졌다 켜질 때마다, 열차는 조금씩 뒤로 빠져나왔다.',
    '당신이 찾는 여자는 마지막 객차에도 없었다. 대신 그녀가 다른 승객에게 맡긴 카드가 남아 있었다. 카드에는 푸른 코어가 비쳤다.'
  ]},
  {id:'light-for-return',chapter:6,art:'helios',position:'50% 0%',location:'검은 전장 밖 · 구조대 집결지',title:'헬리오스는 귀환로를 비추었다.',paragraphs:[
    '헬리오스의 빛은 전장 전체를 태우는 대신, 마지막 들것이 지나갈 길 위에 머물렀다. 살아남은 사람들은 눈을 가리면서도 서로의 손을 놓지 않았다.',
    '당신은 회수한 카드를 빛에 비추었다. 뒷면의 문장이 드러났다. “호출 발신원 — 정합성 심사 대기.”',
    '베스페라의 무전이 도착했다. “세드릭. 코어에 남아 있는 심판자야. 이번에는, 그가 무엇을 지키는지부터 알아야 해.”'
  ]},
  {id:'core-judgment',chapter:7,art:'cedric',position:'50% 22%',location:'코어 레이드 · 사라진 관측소',title:'세드릭은 살아 있는 오류를 보았다.',paragraphs:[
    '코어 앞에 선 세드릭은 구조한 사람들의 기록을 읽었다. 현재의 역사에 출생이 없는 사람, 서로 다른 두 도시에서 같은 날을 살았던 사람, 이미 사망한 것으로 적힌 사람.',
    '“모두 되돌리면, 지금 여기 있는 이들의 삶은 어디에 놓아야 하지?” 그의 물음 뒤로 과거와 현재의 도시가 겹쳤다.',
    '그는 악의로 명부를 지우는 것이 아니었다. 한 번 세계를 살렸던 계산을, 지금도 끝내지 못하고 있었다.'
  ]},
  {id:'circuit-of-names',chapter:7,art:'core-observatory',character:'azant',speaker:'아잔트',location:'코어 동조 · 끊어진 회로',title:'연결은, 복사와 달랐다.',paragraphs:[
    '아잔트가 결정 기록을 펼쳤다. 지워진 역사를 현재 위에 덮어쓰지 않고, 돌아온 사람이 새로 남긴 흔적만 이어 붙이는 길이었다. 목격자 서명, 구조대의 인계 기록, 열린 집의 문.',
    '당신은 코어의 맥동에 맞춰 끊어진 회로를 잇기 시작했다. 폭발이 번질 때는 차폐 구역으로 몸을 피했다. 서두르면 두 기록이 함께 타 버렸다.',
    '“과거를 똑같이 재현할 필요는 없다. 그들이 오늘 여기까지 왔다는 사실부터 남겨.”'
  ]},
  {id:'guard-the-gap',chapter:7,art:'frontier',location:'관측소 외벽 · 무너지는 경계',title:'검이 지켜야 할 틈.',paragraphs:[
    '밖에서는 천룡검황 진무가 무너지는 통로를 붙잡았다. 족로는 청룡단천으로 길을 덮쳐 오는 균열을 갈랐다. 압도적인 힘도 안쪽에서 사람을 분류하는 계산까지 대신 끝낼 수는 없었다.',
    '크라이베른은 구조대의 뒤를 지켰고, 발테르는 마지막 대피 신호를 기다렸다. 베르칸과 강윤의 화살은 관측소로 향하는 포화를 하나씩 지웠다.',
    '그들이 벌어 준 시간 안에서, 당신에게 남은 일은 한 사람을 기록하는 것이었다.'
  ]},
  {id:'third-answer',chapter:7,art:'core-observatory',character:'vespera',speaker:'베스페라',location:'코어 심층 · 목격자 기록',title:'지우지도, 덮어쓰지도 않는 대답.',paragraphs:[
    '당신은 빈 의뢰서를 코어 앞에 놓았다. 누나의 이름을 지어 채우지 않았다. 그녀에게 의뢰를 받았고, 동생을 데려왔으며, 아직 다시 만나지 못했다는 사실을 차례로 적었다.',
    '베스페라가 마지막 줄을 읽었다. “대상 미확인. 수색 계속.” 그녀는 처음으로 짧게 웃었다. “그래. 끝나지 않았다고 적을 수도 있지.”',
    '세드릭의 검이 멈췄다. 코어는 모순을 해결하지 못한 채, 그 기록을 남겨 두었다. 누군가를 지워야만 다음 날로 갈 수 있다는 규칙에 처음으로 빈틈이 생겼다.'
  ]},
  {id:'returning-call',chapter:7,art:'city',character:'sister',speaker:'돌아온 호출',echo:true,location:'새벽 · 다시 열린 주파수',title:'이번에는, 모두의 목소리가 들렸다.',paragraphs:[
    '연락소로 돌아온 당신에게 동생이 물었다. 누나를 찾았느냐고. 당신은 아직이라고 대답했다. 이번에는 그 말 뒤에 이어 보여 줄 길과 기록이 있었다.',
    '무전기에서 익숙한 숨소리가 새어 나왔다. “동생은… 잘 있나요?” 너머에는 다른 사람들의 목소리도 함께 들렸다. 누군가는 길을 묻고, 누군가는 잊힐까 봐 자기 이름을 되풀이했다.',
    '베스페라가 새 의뢰서를 펼쳤다. 용병들은 각자의 장비를 챙겼다. 당신은 송신 버튼을 눌렀다.',
    '“듣고 있습니다. 한 사람씩, 말씀해 주세요.”'
  ]}
]);

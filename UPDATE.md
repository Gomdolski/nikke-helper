# 주간 업데이트 순서 (매주 금요일)

니케는 목요일에 업데이트돼요. 금요일에 아래를 확인하고, 바뀐 게 있을 때만 올려요.

## 1. 바뀐 게 있는지 확인

| 확인할 것 | 어디서 | 고칠 파일 |
|---|---|---|
| 새 니케 (이름, 속성, 무기, 버스트, 제조사) | blablalink 니케 도감, Prydwen 캐릭터 목록 | `build/prydwen.json`, `build/src/roster_compact_ko_en.json` |
| 새 유니온 레이드 시즌 보스 | dildoro.com/union | `build/union_seasons.json` |
| 새 솔로 레이드 시즌 보스 | 나무위키 ‘승리의 여신: 니케/콘텐츠’, 공식 공지 | `build/solo_seasons.json`, `build/build.js`의 다음 시즌 예정 항목 |
| 솔로 레이드 상위권 덱 | `node build/update-soloraid.js` 실행 (레츠도로, 한국 서버) | `build/src/soloraid_rank.json` |
| 새 니케 초상화 | `node build/update-portraits.js` 실행 | `build/src/portraits.json` |
| 새 니케 별명 | 디시·아카 줄임말 | `build/nicknames.json` |
| 이상개체 요격전 변경 | Prydwen Anomaly Interception 가이드 | `build/anomaly.json` |
| 새 캠페인 챕터 (51장~) 보스·데려갈 속성 | 디시·아카 우월코드 정리글, wiki3.jp, gamewith | `build/campaign.json` |
| 티어·추천 옵션·큐브 변경 | Prydwen | `build/prydwen.json` |

조사는 OpenCode(`opencode2 run "..."`)나 Command Code(`command-code -p "..."`)에 먼저 맡기고, 둘 다 안 되면 Claude 서브 에이전트(Sonnet)를 써요.

## 1-1. 이번 주 바뀐 점 쓰기

`build/weekly.json`을 새로 써요. 도감 위 ‘이번 주 바뀐 점’ 상자에 나와요.

- `at`: 오늘 날짜, `title`: 예) "11월 셋째 주"
- `game`: 게임 쪽 중요한 변화 1~3줄 (새 니케, 레이드 시즌 등). 공지 전문은 옮기지 말고 짧게만.
- `helper`: 도우미에 반영한 것 1~5줄 (별명 몇 개 추가 등)

## 2. 만들고 확인하기

```bash
node build/build.js --note "이번 주 바뀐 점 한 줄"
```

- `index.html`을 로컬 서버로 열어 콘솔 에러가 없는지, 도감·티어표·레이드 탭이 뜨는지 확인해요.
- 바뀐 게 없으면 빌드하지 말고 끝내요 (빌드만 해도 버전이 바뀌어서 친구에게 알림이 떠요).

## 3. 올리기

```bash
git add -A
git commit -m "주간 업데이트: ..."
git push
```

몇 분 뒤 https://gomdolski.github.io/nikke-helper/version.json 의 `v`가 새 버전인지 확인해요.

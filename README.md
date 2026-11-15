# 지원금 레이더 파이프라인

정부·지자체 지원금 공공데이터를 매일 수집 → Claude가 쉬운 말로 요약·분류 → 검색용 정적 사이트 + 주간 뉴스레터를 자동 생성합니다.

```
① fetch       공공서비스(혜택) API → data/services.json   (변경분만 증분 수집)
② enrich      Claude 요약·분류·FAQ → data/enriched.json   (수정된 건만 재처리)
③ build       site/ 정적 사이트 (홈·분야별·사업별 페이지, sitemap, FAQ 구조화데이터)
④ newsletter  out/newsletter-날짜.html / .md (월요일 자동, --newsletter 로 강제)
```

## 지금 바로 해보기 (키 없이)

```bash
npm install
node src/run.js --newsletter
```

키가 없으면 샘플 6건 + 규칙 기반 요약으로 끝까지 돕니다. `site/index.html`을 브라우저로 열어 보세요. 샘플 빌드는 상단에 경고 띠가 붙고 검색엔진 수집이 막혀 있습니다(noindex).

## 실제 데이터로 돌리기

1. **공공데이터 키**: [data.go.kr 행정안전부_대한민국 공공서비스(혜택) 정보](https://www.data.go.kr/data/15113968/openapi.do) → 활용신청(자동승인, 개발계정 일 10,000건) → 마이페이지의 *일반 인증키(Decoding)* 복사
2. **Claude 키**: console.anthropic.com → API Keys
3. `.env.example`을 `.env`로 복사해서 두 키를 넣기
4. 첫 실행: `ENRICH_LIMIT=50`인 상태로 `node src/run.js --full` → 사이트에서 요약 품질 확인 → 괜찮으면 `ENRICH_LIMIT=0`으로 나머지 처리

## 비용 감각 (Claude 요약)

건당 입력 약 1~2천 토큰, 출력 약 1천 토큰 기준 대략:

| 모델 | 1건 | 전체 1만 건 (최초 1회) |
|---|---|---|
| claude-opus-5-5 (기본) | 약 $0.02~0.03 | 약 $200~300 |
| claude-sonnet-5-5 | 약 $0.01~0.015 | 약 $100~150 |
| claude-haiku-5-5 | 약 $0.001 | 약 $10 |

최초 1회 이후에는 **수정된 건만** 다시 요약하므로 매일 비용은 훨씬 적습니다. 전체 건수와 실제 토큰은 실행 로그의 `[enrich] 토큰 사용`으로 확인하세요. 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도하도록(`fallbacks: "default"`) 켜 두었습니다.

## 대량 요약은 Batch API로 (가격 절반)

```bash
node src/batch.js submit      # Claude 요약이 없는 건 전부 제출 (숫자를 붙이면 그 건수만)
node src/batch.js status      # 진행 상황
node src/batch.js collect     # 끝난 결과 반영 → 이후 node src/build.js
```

보통 1시간 안에 끝나고 최대 24시간이 걸립니다. 배치는 거절 시 대체 모델(fallbacks)을 쓸 수 없어서, 거절되거나 오류 난 건은 규칙 기반 요약으로 남습니다.

## 매일 자동 실행

- **내 PC**: Windows 작업 스케줄러에 `node src/run.js`를 매일 오전 6시로 등록
- **추천**: GitHub 저장소 + GitHub Actions(매일 cron) → `site/`를 Cloudflare Pages나 GitHub Pages로 배포 (PC를 꺼 놔도 돌아감)

## 요양기관 찾기 (/care/)

국민건강보험공단 장기요양기관 데이터를 받아 시도 → 시군구 → 기관 페이지를 만듭니다. 같은 `DATA_GO_KR_KEY`를 쓰되 공공데이터포털에서 3개 API(15059029 검색, 15058856 시설별 상세조회, 15077871 법정동코드)를 따로 활용신청해야 합니다.

```bash
node src/care-fetch.js    # 전체 목록 + 시설 상세 CARE_DETAIL_LIMIT곳(기본 600, 오래된 것부터)
node src/care-build.js    # site/care 미리보기 생성
```

- 정식 발행은 `CARE_PUBLISH=1`일 때만. GitHub Actions에서는 기본으로 켜져 있고 저장소 변수 `CARE_PUBLISH=0`으로 끕니다 (`run.js`가 수집, `build.js`가 `/care/`와 `sitemap-care.xml` 생성).
- 상세조회는 초당 호출 제한이 빡빡해 한 줄로 300ms 간격을 둡니다(600곳 약 20분). 시설 약 1만 2천 곳을 한 바퀴 도는 데 20일쯤 걸립니다.
- 기관유형·인력·비급여 코드표는 명세에 설명이 없어 실데이터로 대조해 정했습니다(`care-common.js`, `care-build.js` 주석 참고).

## 수익화 순서

1. 사이트 배포 → Google Search Console·네이버 서치어드바이저에 sitemap 제출
2. 페이지 100개 이상 + 방문 생기면 애드센스 신청 → `.env`의 `ADSENSE_CLIENT`
3. 뉴스레터(스티비 등) 구독 받기 → 카카오 채널 "조건 맞춤 알림" 유료화 검토

## 주의

- 요약은 AI가 쓴 것이라 틀릴 수 있습니다. 모든 페이지에 원문 링크·수정일·확인일을 넣었고 "원문 확인" 안내를 달았습니다.
- `.env`(키)는 절대 공유·커밋하지 마세요.

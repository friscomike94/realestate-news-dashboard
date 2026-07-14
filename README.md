# 부동산 뉴스 인사이트 대시보드

한국 부동산 뉴스를 매일 자동 수집·분석해 하나의 대시보드로 보여줍니다.
네이버 검색 API + 주요 경제지 RSS를 크롤링하고, 인지부하·정보채집·전주의 처리 원리로 재구성합니다.

**Live:** `https://<사용자명>.github.io/<레포명>/`

## 담긴 기능
- **TL;DR 3줄 요약** + KPI(전일 대비 델타)
- **시장 심리 지수** (강세/중립/약세, 순심리 %p)
- **오늘 꼭 볼 5건** (여러 매체 동시 보도 = 커버리지 랭킹)
- **핫 엔티티** (단지·지역·건설사·정책주체 언급 랭킹)
- **테마·지역·키워드** 분포 (전일 대비 상승/하락 표시)
- **관심사 저장** (테마·지역 저장 → 다음 방문 시 기본 뷰)
- **접이식 뉴스 피드** (테마별 아코디언)

## 자동 갱신 (GitHub Actions)
`.github/workflows/update.yml` 이 매일 07:00 KST 에 `scripts/build.mjs` 를 실행해
`index.html` 을 다시 생성하고 커밋합니다. GitHub Pages 가 그 파일을 서빙합니다.
**내 컴퓨터가 꺼져 있어도** 클라우드에서 돕니다.

## 최초 세팅 (한 번만)
1. 이 폴더를 새 GitHub 레포로 push.
2. **Settings → Secrets and variables → Actions → New repository secret** 에 등록:
   - `NAVER_CLIENT_ID`
   - `NAVER_CLIENT_SECRET`
   (네이버 개발자센터 → 내 애플리케이션 → 검색 API 앱에서 발급한 값)
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** 선택.
4. **Actions 탭 → Update Dashboard → Run workflow** 로 첫 실행. 이후 매일 자동.

## 로컬 실행 (선택)
```bash
export NAVER_CLIENT_ID=xxxx
export NAVER_CLIENT_SECRET=xxxx
npm run build     # -> index.html 생성
```

## 구조
```
scripts/build.mjs     # 크롤링 + 집계 + HTML 생성
scripts/template.html # 대시보드 템플릿 (데이터는 __DATA__ 자리에 주입)
data/snapshots/       # 일자별 스냅샷 (추세 히스토리용)
index.html            # 생성된 결과물 (Pages 가 서빙)
.github/workflows/    # 자동 갱신 워크플로우
```

## 설계 근거
- 인지부하이론 (Sweller) · 점진적 공개 (NN/g) → 요약 먼저, 세부는 나중에
- 전주의적 처리 (Few·Ware) · 데이터잉크 (Tufte) → 0.2초에 훑어지는 화면
- 정보채집 이론 (Pirolli & Card) · 선택 과부하 → 스스로 사냥하게

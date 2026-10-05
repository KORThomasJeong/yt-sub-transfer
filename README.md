# YouTube 구독 내보내기·가져오기 (Subscriptions Export & Import for YouTube)

YouTube 구독 목록을 파일로 내보내고, 다른 계정으로 가져오는 크롬 확장 프로그램(Manifest V3)입니다. 완전 무료이고 서버나 API 키가 필요 없습니다.

- **내보내기**: JSON(이 확장 전용 형식) 또는 CSV(Google Takeout과 같은 열 구성이라 FreeTube·NewPipe 등에서도 읽힘)
- **가져오기**: 이 확장의 JSON, Google Takeout `subscriptions.csv`, NewPipe/FreeTube JSON, 채널 ID(`UC…`)가 들어 있는 아무 텍스트 파일
- 이미 구독 중인 채널은 자동으로 건너뜁니다. 가져오기가 끝나면 구독 목록을 다시 읽어 결과를 확인하고, 실패한 채널은 CSV로 받을 수 있습니다.

## 동작 방식 (2026년 10월 기준)

화면의 버튼을 찾아 누르는 방식(DOM/XPath)이 아닙니다. youtube.com이 내부에서 쓰는 **InnerTube API**(`/youtubei/v1/*`)를, 그 탭에 이미 로그인된 세션으로 직접 호출합니다.

| 용도 | 엔드포인트 | 요청 본문 |
|---|---|---|
| 구독 목록 읽기 | `POST /youtubei/v1/browse` | `{ browseId: "FEchannels" }` → `channelRenderer` 항목, 다음 페이지는 `continuationItemRenderer` 토큰 |
| 구독하기 | `POST /youtubei/v1/subscription/subscribe` | `{ channelIds: [id], params: "EgIIARgAUAE=" }` |

- 인증: `Authorization` 헤더에 `SAPISIDHASH`, `SAPISID1PHASH`, `SAPISID3PHASH` 세 값을 넣습니다. 값은 `USER_SESSION_ID ts SAPISID origin`의 SHA-1이고 끝에 `_u`가 붙습니다. yt-dlp 최신 구현과 같은 방식입니다.
- 클라이언트 버전, visitor data, `SESSION_INDEX`, `DELEGATED_SESSION_ID` 같은 값은 실행할 때 페이지의 `ytcfg`에서 읽습니다. 그래서 YouTube 클라이언트 버전이 올라가도 깨지지 않습니다. 브랜드 계정이나 여러 계정을 쓰는 경우에도 그 탭에서 활성화된 계정을 따라갑니다.
- 2026-10-05에 클라이언트 `2.20261002.01.00`으로 실제 확인했습니다. 응답 경로는 `twoColumnBrowseResultsRenderer › … › shelfRenderer › expandedShelfContentsRenderer › channelRenderer`입니다.
  - 주의: `channelRenderer`의 `subscriberCountText`에는 실제로 **핸들**이 들어 있고, `videoCountText`에 구독자 수가 들어 있습니다(YouTube 쪽 특이사항). 이 확장은 핸들을 `canonicalBaseUrl`에서 가져옵니다.

### YouTube가 바뀌었을 때

YouTube에 의존하는 코드는 전부 `page/yts.js`에 있습니다.
- 내보내기 결과가 0개일 때: `/feed/channels`를 열고 개발자 도구 › Network에서 `browse` 응답의 렌더러 이름이 무엇으로 바뀌었는지 확인한 뒤 `collect()`를 고칩니다.
- 가져오기가 400/403으로 실패할 때: 채널 페이지에서 구독 버튼을 누를 때 YouTube가 보내는 요청의 `params` 값을 복사해 `SUBSCRIBE_PARAMS`를 바꿉니다.

## 설치 (개발용)

1. `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기
2. **압축해제된 확장 프로그램 로드** → 이 폴더(`yt-sub-transfer`) 선택
3. youtube.com에 로그인한 탭에서 확장 아이콘 클릭

## 사용법

1. **내보내기**: 원래 계정으로 로그인된 youtube.com 탭 → 아이콘 → `JSON 내보내기`(또는 CSV)
2. 대상 계정으로 전환 (YouTube 프로필 메뉴 › 계정 전환, 또는 다른 크롬 프로필)
3. **가져오기**: 아이콘 → 파일 선택 → 대기 시간 설정(기본 2초) → `가져오기 시작`
   - 팝업을 닫아도 가져오기는 페이지에서 계속 진행됩니다. 같은 탭에서 팝업을 다시 열면 진행 상황이 보입니다. **탭을 닫거나 새로고침하면 안 됩니다.**
   - 수백 개처럼 많으면 YouTube가 속도를 제한할 수 있습니다. 429 응답이 오면 자동으로 쉬었다가 다시 시도합니다. 실패가 많으면 대기 시간을 3~5초로 늘리고 같은 파일로 한 번 더 돌리세요(이미 구독된 채널은 건너뜁니다).

## 웹 스토어용 패키징

```powershell
./scripts/package.ps1   # → dist/yt-sub-transfer-<버전>.zip
```

스토어 등록 문구, 권한 사유, 개인정보 신고 항목은 [STORE.md](STORE.md), 개인정보처리방침은 [PRIVACY.md](PRIVACY.md)에 있습니다.

## 구조

```
manifest.json        MV3, 권한: scripting + www.youtube.com
page/yts.js          InnerTube 호출 (페이지 MAIN world에서 실행)
popup/               화면(popup.html/js/css), 파일 형식 처리(formats.js)
_locales/en, ko      영어·한국어 화면 문구
icons/               16/32/48/128 PNG
```

## 참고한 소스

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) `yt_dlp/extractor/youtube/_base.py`: 최신 SAPISIDHASH 방식 (Unlicense)
- [owldesign/YouTube-Subporter](https://github.com/owldesign/YouTube-Subporter), [biplobsd/yst](https://github.com/biplobsd/yst): 같은 목적의 기존 오픈소스 확장 (DOM/XPath 방식이라, 이 프로젝트는 API 방식으로 바꿈)

## 라이선스

MIT · 소스: <https://github.com/KORThomasJeong/yt-sub-transfer>

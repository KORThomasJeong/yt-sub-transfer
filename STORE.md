# 크롬 웹 스토어 등록 메모

## 등록 전 준비

1. 개발자 계정: <https://chrome.google.com/webstore/devconsole>. 등록할 때 **한 번만 5달러**를 냅니다. 확장 자체는 무료 배포이고 이후 드는 비용은 없습니다.
2. 개인정보처리방침 URL: <https://github.com/KORThomasJeong/yt-sub-transfer/blob/main/PRIVACY.md>
3. `./scripts/package.ps1` 실행 → `dist/*.zip` 업로드
4. 스크린샷: 1280×800(또는 640×400) 이미지가 최소 1장 필요합니다. YouTube 페이지 옆에 팝업이 열린 화면을 캡처하면 됩니다.
5. 작은 프로모션 타일 440×280 (선택, 권장)

## 스토어 등록 정보

- **이름**: Subscription Transfer for YouTube / 구독 내보내기·가져오기 (YouTube용)
  (상표 정책: 이름이 "YouTube"로 시작하면 안 되고 "for YouTube" 형태로 써야 합니다. 아이콘에 YouTube 로고를 쓰면 안 됩니다.)
- **카테고리**: 생산성(Productivity) 또는 도구(Tools)
- **언어**: 한국어, 영어
- **요약**(132자 이하): `_locales`의 `extDescription` 값이 그대로 쓰입니다

설명문은 아래 파일 내용을 그대로 붙여넣으면 됩니다.

- 한국어 칸: [store-assets/listing-ko.txt](store-assets/listing-ko.txt)
- 영어 칸: [store-assets/listing-en.txt](store-assets/listing-en.txt)

## 이미지

`store-assets/out/`에 있습니다. 다시 만들려면 `store-assets/capture.ps1`을 실행하세요(헤드리스 크롬으로 실제 팝업 코드를 예시 데이터로 띄워 캡처).

| 파일 | 용도 |
|---|---|
| `screenshot-ko-1-free.png` ~ `-3-import.png` | 한국어 스크린샷 (1280×800) |
| `screenshot-en-1-free.png` ~ `-3-import.png` | 영어 스크린샷 (1280×800) |
| `promo-small-ko.png`, `promo-small-en.png` | 작은 프로모션 타일 (440×280) |
| `icons/icon-128.png` | 스토어 아이콘 (128×128) |

스크린샷에 나오는 채널 수(248개)와 채널 이름은 예시 데이터입니다. 실제 계정 정보는 들어 있지 않습니다.

## 개인정보 보호 관행 탭

심사는 영어로 진행되므로, 입력 칸에는 각 항목 아래의 영어 문구를 붙여넣는 것을 권장합니다.

- **단일 목적**: 사용자의 YouTube 구독 목록을 파일로 내보내고, 구독 목록 파일을 로그인된 계정으로 가져옵니다.
  > Export the user's YouTube subscription list to a file and import a subscription list file into the signed-in YouTube account.
- **권한 사유**
  - `scripting`: 사용자가 팝업에서 내보내기/가져오기를 누를 때, 활성 youtube.com 탭에 YouTube 웹 API를 호출하는 스크립트를 넣습니다.
    > Injects the script that calls YouTube's web API on the active youtube.com tab when the user clicks Export or Import in the popup.
  - 호스트 `https://www.youtube.com/*`: 사용자의 기존 세션으로 구독 목록을 읽고 채널을 구독하는 데 필요합니다. 다른 사이트에는 접근하지 않습니다.
    > Needed to read the subscription list and subscribe to channels on youtube.com using the user's existing session. No other sites are accessed.
- **원격 코드**: 사용 안 함(No). 모든 코드가 패키지 안에 들어 있습니다.
- **데이터 사용**: 수집·전송하는 사용자 데이터 없음. 데이터 유형 체크박스는 모두 비워 두고, 아래 확인 체크박스 3개만 체크합니다.

## 심사자 메모 ("Notes for reviewer" 칸, 요청 시)

이 확장은 사용자가 직접 버튼을 누른 뒤에만, 페이지 안에서 youtube.com 자체 웹 엔드포인트(`/youtubei/v1/browse`, `/youtubei/v1/subscription/subscribe`)를 사용자의 기존 세션으로 호출합니다. 자격 증명이나 쿠키를 수집하지 않고 youtube.com 외의 서버로 아무것도 보내지 않습니다.

> The extension uses youtube.com's own first-party web endpoints (`/youtubei/v1/browse` and `/youtubei/v1/subscription/subscribe`) from the page context, with the user's existing session, only after an explicit user click. It does not collect credentials or cookies and sends nothing to any server other than youtube.com.

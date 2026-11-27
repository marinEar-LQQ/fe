# marinEar · Frontend

조타실 휴대폰·태블릿에서 쓰는 PWA. 들어온 VHF 교신의 핵심 정보(선박·터미널·선석)를 **내 작업 기록과 비교**하고, 원음/완화음 인식 차이·번역·작업 일지를 보여준다.
기준 문서: 프론트엔드 / 백엔드 / 통합 기술설명서 v1.0 (2026.11.27)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 단위 테스트 (이벤트 규칙·버전 충돌·비교 규칙)
npm run build      # 타입 검사 + 배포 빌드
```

음성 입력(getUserMedia)은 **HTTPS 또는 localhost** 에서만 동작한다. 태블릿 실기기 테스트는 HTTPS 배포 주소로 한다.

## 현재 상태 (구현 순서 1~2단계 완료)

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 공통 schema(`src/contracts`) + MockEngineClient | ✅ |
| 2 | 5개 메뉴 + 빈/오류/로딩 상태 | ✅ |
| 3 | 파일 분석 엔진 연결 (Worker adapter) | ⏳ 백엔드 엔진 필요 |
| 4 | 실제 오디오 입력 | 🟡 캡처·레벨·프레임 전송까지 구현, 분석은 엔진 연결 후 |
| 5 | PWA·모델 캐시 | 🟡 manifest·앱 shell 캐시만. 모델 캐시는 엔진 연결 후 |
| 6 | 번역·재생·반영·내보내기 통합 검수 | 🟡 Mock 기준 동작 |

> ⚠️ 지금 화면의 자막·비교·번역은 **Mock 고정 데이터**다. 화면에 항상 `시연 데이터` 배지가 붙는다.

## 화면

| 메뉴 | 경로 | 기능 |
| --- | --- | --- |
| 교신 | `/monitor` | 수신 시작/중지, 파일 분석, 시연 시나리오, 전체/내 작업/재확인 필터, 원문+번역 |
| 재확인 | `/reviews`, `/reviews/:id` | 장소 비교(발화 당시 기준 vs 언급), 원음/완화음 인식 차이, 재생, 확인/관련 없음/기록 반영 |
| 작업 일지 | `/report` | 기준 변경·교신·사용자 확인·메모 시간순, 건수 집계, TXT/JSON/인쇄 |
| 오늘 작업 | `/task` | 내 배·대상·터미널·선석·메모 등록, 장소 검증, 불변 버전 저장 |
| 설정 | `/settings` | 입력 장치, 모델/오프라인 준비 상태, 번역 언어, 큰 글씨, 저장 공간, 앱 설치 안내 |

## 구조

```
src/app/            앱 셸, 탐색, 전역 상태(reducer), 오류 경계
src/features/       task / radio / review / report / settings
src/engine/         EngineClient 인터페이스, Mock adapter, 일지 텍스트 생성
src/contracts/      공통 타입, 장소 카탈로그(시연용), 언어 코드, 라벨
src/repositories/   IndexedDB (작업 버전·발화·결과·검토·메모·음성 Blob)
src/audio/          getUserMedia + AudioWorklet 캡처 (public/worklets)
src/ui/             재디자인 가능한 표시 부품 + 디자인 토큰(tokens.css)
```

## 엔진 교체 (백엔드 담당과 맞출 부분)

- UI는 `EngineClient`(`src/engine/EngineClient.ts`)만 호출한다. 실제 엔진은 같은 인터페이스로 `WorkerEngineClient`를 만들고 `src/engine/index.ts`에서 주입만 바꾸면 된다.
- 이벤트: `input.status · analysis.progress · transcript.partial · analysis.final · translation.updated · review.updated · task.updated · engine.error`
- **계약 협의 필요**
  - 직접 메모 저장 명령이 계약에 없어 프론트가 IndexedDB `notes` 저장소에 직접 저장한다.
  - `getActiveTask()`(앱 시작 시 현재 기준 복원)를 보조로 추가했다.
  - 데모·파일 세션 종료를 `analysis.progress`의 `stage: 'SESSION_CLOSED'`로 알린다.
  - `openSession`에 파일 입력용 `file` 인자를 추가했다.

## 디자인 교체

색상·서체·여백은 `src/ui/tokens.css`, 표시 부품은 `src/ui/components.tsx`와 `src/index.css`에 모여 있다. 업무 로직은 features/engine에 있으니 디자인 변경 시 건드리지 않아도 된다.

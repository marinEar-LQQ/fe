# marinEar · Frontend

조타실 휴대폰·태블릿에서 쓰는 PWA. 들어온 VHF 교신의 핵심 정보(선박·터미널·선석)를 **내 작업 기록과 비교**하고, 원음/완화음 인식 차이·번역·작업 일지를 보여준다.
기준 문서: 프론트엔드 / 백엔드 / 통합 기술설명서 v1.0 (2026.11.27)

분석 엔진은 백엔드 패키지 [`marinear-engine`](https://github.com/marinEar-LQQ/backend) (`github:marinEar-LQQ/backend`)를 쓴다. 상시 서버 없이 브라우저 Web Worker 안에서 모델이 돈다.

## 실행

```bash
npm install                    # marinear-engine 은 GitHub 에서 받아 설치 중 dist 를 빌드한다
npm run dev                    # http://localhost:5173 — 실제 엔진(WorkerEngineClient)
npm test                       # 단위·통합 테스트 (reducer 규칙 + MockEngineClient 시나리오·파일 경로)
npm run build                  # 타입 검사 + 배포 빌드
```

- 음성 입력(getUserMedia)은 **HTTPS 또는 localhost** 에서만 동작한다. 태블릿 실기기 테스트는 HTTPS 배포 주소로 한다.
- `npm install` 은 `github:marinEar-LQQ/backend` 저장소에 접근할 수 있어야 한다. SSH 키는 필요 없다 — npm 은 GitHub 의존성을 `codeload.github.com` https tarball 로 받는다. 팀원은 `npm ci` 를 권장한다(lock 의 커밋 고정).
- lock 의 `resolved` 는 `git+https://...` 로 두었지만, 다른 패키지를 `npm install` 하면 npm 이 GitHub 주소를 `git+ssh://` 로 다시 쓸 수 있다. 받는 방식은 위와 같아서 동작에는 영향이 없다. 커밋 전에 https 로 되돌리고 싶으면 `sed -i 's#git+ssh://git@github.com/#git+https://github.com/#' package-lock.json`.
- 엔진 버전 올리기: `npm i github:marinEar-LQQ/backend` (lock 의 커밋이 최신으로 바뀐다).

### 시연 백업 (모델 없이)

```bash
VITE_ENGINE=mock npm run dev          # PowerShell: $env:VITE_ENGINE='mock'; npm run dev
```

`MockEngineClient` (실제 엔진과 같은 규칙·IndexedDB, ASR/번역만 시연 고정 데이터)로 동작한다.
교신 화면에 **시연 시나리오** 버튼이 생기고(Worker 모드에선 숨김), 시연 작업(엔진 `DEMO_TASK`: 해동호 / 현대부산호 / PNIT 2번 — 일부러 틀린 기록)이 있으면 재사용, 없으면 새로 등록한 뒤 팀 대본 3개(9개 대사)를 재생한다.
결과의 `origin === 'fixture'` 또는 세션 `inputInfo.fixtureMode` 이면 카드·일지에 **시연 데이터** 배지가 붙는다.

## 엔진 연결

| | |
| --- | --- |
| 주입 지점 | `src/engine/index.ts` 한 곳. `VITE_ENGINE=mock` → `MockEngineClient.create()`, 기본 → `new WorkerEngineClient(new EngineWorker(), { allowRemote: true })` |
| 실패 처리 | 엔진은 `EngineError` 예외를 던진다. `VERSION_CONFLICT`·`RESULT_STALE` 는 **자동 재시도하지 않고** 최신 기준·결과를 다시 불러와 보여준다 |
| 작업 복원 | 앱 시작 시 `listTasks()` → 가장 최근 작업 → `getTaskLog()` 의 `activeVersion` |
| 메모 | `engine.saveNote(taskId, text)`. 삭제는 빈 내용으로 저장(`deleted: true`, 기록은 남음) |
| 실시간 입력 | AudioWorklet → `openSession(taskId, 'live')` → `appendAudio` → `closeSession`. pcm 버퍼는 Worker 로 transfer 되므로 넘긴 뒤 재사용하지 않는다. 장치 끊김은 Worker 엔진일 때만 `markDisconnected` |
| 작업 필수 | 엔진은 작업 없이 세션을 열지 않는다 → 작업이 없으면 수신·파일 분석 버튼 비활성 |

### Vite 설정 (`vite.config.ts`)

- `worker: { format: 'es' }`, `optimizeDeps.exclude: ['@huggingface/transformers']` (패키지 README 요구사항)
- **COOP/COEP 헤더** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`)를 dev·preview 서버에 적용. `crossOriginIsolated` 가 켜져야 ONNX Runtime WASM 이 멀티스레드로 돈다. **배포 서버(정적 호스팅)에도 같은 헤더를 설정해야 한다.**
- vitest 는 `server.deps.inline: ['marinear-engine']` — 패키지 dist 가 확장자 없는 import(번들러 전용)라 Node 에서 직접 못 읽는다.
- `prebuild`(`scripts/clean-dist.mjs`)가 dist 를 지운다. Node 24 의 재귀 `fs.rmSync`(Vite `emptyOutDir` 도 사용)가 Windows 비ASCII 경로(예: `바탕 화면`)에서 프로세스를 죽이는 문제 우회.

## 모델 준비 (설정 › 분석 엔진)

- **모델 다운로드** → `loadAssets(DEFAULT_ASSET_MANIFEST, onProgress)`. 모델별 받은 용량·%·상태(다운로드/검증/준비/오류)와 자체 검사 결과를 표시한다.
- 번역 언어별 사용 가능 여부(`readiness.languages`), `offlineReady`, `canAnalyze`, 카탈로그 버전(시연용 여부)을 표시한다.
- 한 번 준비를 마친 기기는 다음 실행 때 자동으로 캐시에서 다시 불러온다(Worker 는 재시작마다 모델을 메모리에 올려야 함).
- `canAnalyze === false` 이면 교신 화면의 **수신 시작·파일 분석**이 비활성되고 “모델 준비 필요 → 설정” 안내가 뜬다.
- 모델: ASR `onnx-community/whisper-small`(약 250MB), 번역 `Xenova/opus-mt-ko-en` / `opus-mt-en-id` / `opus-mt-en-vi`(합계 약 315MB) — **첫 설치 약 565MB**, Hugging Face 에서 받음. Opus-MT 는 CC-BY-4.0 (Helsinki-NLP, 출처 표기 필요).
- **오프라인 모드** 토글(현장용): 켜면 다음 실행부터 `WorkerEngineClient(..., { allowRemote: false })` — 캐시된 모델만 쓰고 외부 요청을 엔진이 차단한다. 바꾼 뒤 “지금 새로고침”으로 적용. 모델을 처음 받거나 업데이트할 때는 끈다.

## 시연 준비 (설정 › 시연 준비)

- **현재 작업 일지 JSON 저장**: `exportTaskLog(taskId, 'json')` 결과를 내려받는다.
- **JSON 불러오기**: `importTaskLog(json)` → 성공하면 그 작업이 현재 작업이 된다. 형식이 틀리면 `VALIDATION_FAILED` 안내, 현재 작업은 그대로.
- 용도: 인터넷·모델이 있는 PC 에서 실제 모델로 미리 분석 → JSON 저장 → 시연 기기에서 불러와 그대로 보여 주기. 결과의 `origin` 은 원래 값을 유지하고 **음성은 포함되지 않아 재생은 안 된다.**

## 파일 분석 테스트 (`radio-case-*.wav`)

백엔드 저장소의 `fixtures/audio/` (설치된 패키지에도 `node_modules/marinear-engine/fixtures/audio/` 로 들어 있다)에 시연 음성이 있다. Windows TTS + 합성 잡음이며 **현장 성능 근거가 아니다.**

**팀 대본 녹음** (`fixtures/audio/team/script{1,2,3}_noisy.wav`, 정답 `team/truth.json`) — 시연 작업 기준(해동호 / 현대부산호 / PNIT T2)에서 대본 1은 HPNT 장소 차이, “TNIC” 오인식 후보(`ASR_CONFUSABLE`), 속력·침로·지시어·호출부호가 나온다.

예전 단일 사례 파일 (작업 기준: 해동호 / A선박 / PNIT T3 로 등록해서 볼 것):

| 파일 | 기대 판정 |
| --- | --- |
| `radio-case-a.wav` | 장소 차이 (HPNT T3) |
| `radio-case-b.wav` | 원음·완화음 인식 차이 → r2 에서 불명확 `[PNIT / HPNT]` |
| `radio-case-c.wav` | 불명확 (터미널 언급 없음) |
| `radio-case-d.wav` | 다른 선박 |
| `radio-case-match.wav` | 일치 |
| `radio-case-correction.wav` | 정정 ("HPNT 말고 PNIT") |

1. `npm run dev` → **설정 › 분석 엔진 › 모델 다운로드** → “분석 가능” 확인
2. **오늘 작업**: 해동호 / 현대부산호 / PNIT / T2 등록 (예전 사례 파일이면 해동호 / A선박 / PNIT / T3)
3. **교신 › 파일 분석** → `../backend/fixtures/audio/team/script1_noisy.wav` (또는 `radio-case-b.wav`) 선택
4. 카드가 `분석 대기 → 잡음 완화 중 → 완화음 인식 중` → **r1 · 잠정 판정**(원음 교차 검사 중) → `원음 교차 인식 중` → **r2**(교차 검사 완료)로 바뀌는지 확인. r1 상태에서는 재확인 화면의 기록 반영이 막혀 있어야 한다.

모델 없이 화면 흐름만 볼 때는 `VITE_ENGINE=mock` 으로 같은 순서를 확인할 수 있다(Mock ASR 은 파일 내용과 무관하게 시나리오 문장을 순서대로 돌려준다).

## 오프라인 (PWA)

| 무엇 | 누가 저장 | 어디 |
| --- | --- | --- |
| 앱 화면(HTML·JS·CSS·엔진 Worker·worklet·manifest) | 프론트 Service Worker | Cache Storage `marinear-shell-<버전>` |
| 모델·ONNX Runtime(WASM) | 엔진(transformers.js) | Cache Storage (transformers 캐시) — 프론트는 건드리지 않음 |
| 작업·발화·결과·검토·메모·음성 | 엔진 | IndexedDB `marinear` (Mock: `marinear-mock`) |

- `dist/sw.js` 는 빌드 때 `vite.config.ts` 의 `marinear-sw` 플러그인이 `src/pwa/sw.template.js` 로 만든다. 해시된 JS/CSS·엔진 Worker 청크·`index.html`·public 파일을 미리 캐시하고, 빌드 내용이 바뀌면 캐시 버전이 바뀐다. `.wasm` 은 미리 받지 않는다(같은 출처 요청이 생기면 처음 쓸 때 캐시).
- 새 버전은 진행 중 수신을 방해하지 않도록 자동 교체(skipWaiting)하지 않는다. 앱 탭을 모두 닫았다가 다시 열면 적용된다.
- Service Worker 는 배포 빌드(`npm run build` → `npm run preview` 또는 배포 서버)에서만 등록된다. `npm run dev` 에서는 없다.
- **오프라인 준비 완료** 표시는 엔진의 `readiness.offlineReady` 만 따른다. 설정 › 앱 설치의 “앱 화면 캐시”는 화면을 다시 여는 데 필요한 것일 뿐 분석 가능 여부가 아니다.

### 인터넷 끊고 확인하는 방법 (오프라인 재시작)

준비 (온라인):
- [ ] `npm run build && npm run preview` (또는 HTTPS 배포 주소). 응답 헤더에 `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` 가 있는지 개발자도구 Network 에서 확인
- [ ] 설정 › 분석 엔진 › **모델 다운로드** → 음성인식·번역 모델이 “준비됨 / 자체 검사 통과”
- [ ] 쓸 번역 언어가 “사용 가능”
- [ ] 분석 엔진 카드에 **오프라인 준비 완료** 배지
- [ ] 설정 › 앱 설치에 “앱 화면 캐시: 버전 … · 파일 N개 저장됨”
- [ ] 오늘 작업 등록, (선택) 저장 공간 › 영구 보존 요청

끊고 확인 (기기 Wi-Fi·데이터 끄기, PC 는 개발자도구 Network › Offline):
- [ ] 앱 탭을 완전히 닫고 다시 연다 → 화면이 열리고 상단에 등록한 작업 기준이 그대로 보인다
- [ ] 교신·재확인·작업 일지·오늘 작업·설정을 오가도 빈 화면이나 “분석 엔진 준비 중…” 에서 멈추지 않는다
- [ ] 설정 › 분석 엔진이 다시 **분석 가능 / 오프라인 준비 완료** (재시작 때 캐시에서 모델을 다시 불러온다. 시간이 조금 걸릴 수 있음)
- [ ] 설정 › 분석 엔진 › 오프라인 모드를 켜고 새로고침 → “적용 중”
- [ ] 교신 › 파일 분석으로 `team/script1_noisy.wav` 분석 → r1 → r2 결과가 나온다
- [ ] 선택 언어 번역이 나온다 (미설치 언어는 “번역 자원 미설치” 안내만 나오고 몰래 온라인 번역하지 않는다)
- [ ] 수신 시작 → 입력 레벨과 “엔진 수신 중” 표시, 발화가 분석된다
- [ ] 이전 교신 기록·메모·기준 변경 이력이 작업 일지에 남아 있고 TXT/JSON 내보내기가 된다
- [ ] 개발자도구 Console 에 huggingface.co / cdn.jsdelivr.net 요청 실패가 **분석 실패로 이어지지 않는다**

실패하면: 분석 엔진 카드의 모델 상태·오류 문구와 Console 오류(특히 ONNX Runtime WASM 요청)를 백엔드에 전달한다.

> 확인된 범위 (2026-11-27, headless Chrome + `vite preview`): SW 제어 상태에서 네트워크를 끊고 `/settings` `/monitor` `/report` 재진입, `crossOriginIsolated` 유지, 엔진 Worker 기동까지 확인. 모델 설치 후 오프라인 분석은 이 환경에서 Hugging Face 접속이 막혀 확인하지 못했다.

## 화면

| 메뉴 | 경로 | 기능 |
| --- | --- | --- |
| 교신 | `/monitor` | 수신 시작/중지, 파일 분석, (Mock) 시연 시나리오, 발화별 진행 단계, 전체/내 작업/재확인 필터, 원문+번역 |
| 재확인 | `/reviews`, `/reviews/:id` | 장소 비교(발화 당시 기준 vs 언급), 원음/완화음 인식 차이, 재생, 확인/관련 없음/기록 반영 |
| 작업 일지 | `/report` | 기준 변경·교신·사용자 확인·메모 시간순, 건수 집계(엔진 `counts`), TXT/JSON(엔진 export)/인쇄 |
| 오늘 작업 | `/task` | 내 배·대상·터미널·선석·메모 등록, 장소 검증(엔진 `validateTaskDraft`), 불변 버전 저장 |
| 설정 | `/settings` | 입력 장치, 분석 엔진·모델 준비, 번역 언어, 큰 글씨, 저장 공간, 앱 설치 안내 |

## 구조

```
src/app/            앱 셸, 전역 상태(reducer), 엔진 오류 처리, 오류 경계
src/features/       task / radio / review / report / settings(EnginePanel)
src/engine/         엔진 주입(index), 시연 제어(demo), 확장 기능 가드(extensions), 작업 복원, 일지 타임라인
src/contracts/      화면용 라벨·언어 목록·카탈로그 헬퍼 (타입 원본은 marinear-engine)
src/audio/          getUserMedia + AudioWorklet 캡처 (public/worklets)
src/pwa/            Service Worker 템플릿 (빌드 때 dist/sw.js 생성)
src/ui/             재디자인 가능한 표시 부품 + 디자인 토큰(tokens.css)
```

## 화면 규칙

- 불확실 값은 `[A / B]` 로 표시하고 확정값처럼 보이지 않게 한다.
- 확인 표시 / 관련 없음 / 기록 반영은 별개 행동이다. 반영만 작업 기준의 새 버전을 만든다.
- 반영은 원음 교차 검사가 끝난(`crossCheck === 'complete'`) 결과에서만 가능하다.
- 원음/완화음이 다르게 들린 단어(`transcriptDiff` 의 op ≠ same)는 밑줄 + “확인” 표시, 원음 단어는 툴팁·탭으로 보여 준다. `transcriptDiff` 가 없으면(rev1 등) 강조하지 않는다.
- 불확실 후보는 모든 필드(선박·터미널·선석·시각·숫자)를 `[A / B]`(후보 1개면 `[A?]`)로, 한 발화의 후보를 전부 표시한다. 후보가 하나라도 있으면 기본 반영은 꺼진다.
- 번역 언어: 원문(ko) / 영어 / 인도네시아어 / 베트남어 (미얀마어·필리핀어 제외, 저장된 설정은 ko 로 바뀜).
- 번역 영역: 한국어 원문(맨 위) → **정형 요약 카드**(`translation.summary.lines`, 크게, 불확실한 줄은 “확인 필요”) → **참고 번역**(`reference: true`, “부정확할 수 있음”, 작게). 문장 번역이 없어도(`unavailable`) 요약은 표시한다.
- 번역은 교차 검사가 끝난 revision 에 묶어 요청한다. 문장 번역 모델이 없어도 요약을 받기 위해 화면 언어면 요청한다.

## 디자인 교체

색상·서체·여백은 `src/ui/tokens.css`, 표시 부품은 `src/ui/components.tsx`와 `src/index.css`에 모여 있다. 업무 로직은 features/engine에 있으니 디자인 변경 시 건드리지 않아도 된다.

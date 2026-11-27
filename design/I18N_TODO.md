# 다국어 검수 필요 목록 (id / vi, 일부 en)

화면 문구는 `src/i18n/{ko,en,id,vi}.ts` 에 있다. `ko.ts` 가 원본이고, 다른 언어에서 키가 빠지면 TypeScript 빌드가 실패한다.
아래는 **번역이 확실하지 않아 원어민(가능하면 해사 실무자)의 검수가 필요한 문구**다. 고칠 때는 키 이름은 그대로 두고 값만 바꾼다.

교신 원문(한국어)은 번역하지 않는다. 엔진이 보내는 문구(정형 요약 라벨·지시어 표현, 오류 메시지 원문)는 백엔드(`marinear-engine` `src/engine/translate/summary.ts`)에서 온다. 백엔드도 id/vi 는 "원어민 검수 전"이라고 적어 두었다.

## 해사 용어 (가장 중요)

| 키 | ko | id (현재) | vi (현재) | 확인할 점 |
| --- | --- | --- | --- | --- |
| `fields.terminalId`, `task.terminal` | 터미널 | Terminal | Bến cảng | vi: 컨테이너 터미널을 현장에서 "Bến cảng"으로 부르는지, "Cảng"/"Bến" 이 나은지 |
| `fields.berthId`, `task.berth` | 선석 | Dermaga | Cầu cảng | id: "Dermaga" vs "Tambatan"(berth). vi: "Cầu cảng" vs "Cầu tàu" |
| `entity.course`, `summaryField.course` | 침로 | Haluan | Hướng đi | id: "Haluan" 이 침로(course)로 통하는지. vi: "Hướng đi" vs "Hải trình" |
| `entity.callsign` | 호출부호 | Tanda panggil | Hô hiệu | 둘 다 사전 표현. 현장 용어 확인 |
| `instruction.KEEP_CLEAR` | 피해서 우회 | Jaga jarak, memutar | Tránh xa, đi vòng | 백엔드 요약 문구와 같게 맞춤. SMCP 표준 표현이 따로 있으면 교체 |
| `instruction.PASS_PORT_TO_PORT` / `PASS_STBD_TO_STBD` | 좌현/우현 대 좌현/우현 통과 | Berpapasan lambung kiri… | Tránh nhau mạn trái… | SMCP 표현 확인 (백엔드 문구와 동일) |
| `instruction.STAND_BY` | 대기 | Siaga, tunggu | Chờ lệnh | 무선 교신의 "stand by" 관용 표현 |
| `instruction.TOW_REQUESTED` | 예인 요청 | Meminta kapal tunda | Yêu cầu tàu kéo | 백엔드 문구와 동일 |
| `nav.monitor` | 교신 | Radio | Bộ đàm | vi: "Bộ đàm"(무전기) 대신 "VHF"/"Liên lạc" 가 나은지 |
| `task.targetVessel` | 작업 대상 선박 | Kapal sasaran | Tàu mục tiêu | "sasaran/mục tiêu"가 군사 용어처럼 들리는지. 예: id "Kapal yang dilayani", vi "Tàu làm hàng" |

## 앱 기능 용어

| 키 | ko | id | vi | 확인할 점 |
| --- | --- | --- | --- | --- |
| `transcript.raw`, `reviewDetail.rawClip` | 원음 | Suara asli | Âm thanh gốc | 무난하나 확인 |
| `reviewDetail.enhancedClip`, `reasons.ASR_DISAGREEMENT` | 완화음 / 잡음 완화 | Suara jernih | Âm thanh đã lọc | "잡음을 줄인 소리"의 자연스러운 표현 |
| `engineMode.online` / `offline` | 온라인 / 오프라인 | Daring / Luring | Trực tuyến / Ngoại tuyến | id: 공식어 Daring/Luring 대신 현장에서 "Online/Offline" 을 그대로 쓰는지 |
| `online.server` | 중계 서버 | Server perantara | Máy chủ trung gian | 무난하나 확인 |
| `monitor.wake.*`, `live.wake*` | 화면 꺼짐 방지 | Penjaga layar menyala | Giữ màn hình sáng | id 표현이 어색할 수 있음 ("Layar tetap menyala") |
| `card.crossChecking`, `stage.asr_raw` | 원음 교차 검사 | Pemeriksaan silang suara asli | Đối chiếu âm thanh gốc | 길다. 줄인 표현 제안 환영 |
| `reviewDetail.titleChoice` | {A}인가요, {B}인가요? | {A} atau {B}? | {A} hay {B}? | 짧은 질문형으로 충분한지 |
| `nav.report` | 작업 일지 | Catatan | Nhật ký | 시안 05 의 id 하단 메뉴는 "Catatan" — 그대로 유지 |
| `settings.title` | 내 작업 환경 | Pengaturan kerja saya | Môi trường làm việc | 자연스러운지 |
| `prep.*` | 시연 준비 | Persiapan demo | Chuẩn bị trình diễn | vi: "trình diễn" vs "demo" |

## en (일부)

| 키 | en | 확인할 점 |
| --- | --- | --- |
| `nav.reviews` | Recheck | 시안 영어판이 없음. "Review" 가 나을 수 있음 (단, "Review" 는 다른 의미와 겹침) |
| `reviewDetail.enhancedClip` | Enhanced audio | "Noise-reduced audio" 가 더 정확할 수 있음 |
| `comparison.unrelated` | Other vessel | "Not for my task" 가 의미상 더 정확할 수 있음 |

## 검수 방법

1. 설정 › 언어에서 언어를 바꾸면 화면 전체가 바뀐다. `VITE_ENGINE=mock npm run dev` → 교신 › 시연 시나리오로 카드·번역 영역까지 볼 수 있다.
2. 고친 뒤 `npm run build` 가 통과하는지 확인한다 (키 누락·오타는 빌드 오류).
3. 줄 길이: 버튼·하단 메뉴는 좁다(360px). 긴 번역은 줄바꿈되지만, 하단 메뉴 라벨은 두 줄을 넘기지 않게 짧게 쓴다.

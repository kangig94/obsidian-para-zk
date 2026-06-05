# ZK 모델 재설계안 (spark / source / permanent)

> 상태: **설계 확정, 구현 대기.** 이 문서는 구현의 기준 명세다.
> 작성 맥락: 현재 구현은 ZK 3종을 "선형 승격(promote) 파이프라인"으로 모델링하나,
> 원래 Zettelkasten 개념과 어긋나는 지점이 있어 재정렬한다.
> 전제: **미공개·미운용 프로젝트.** 레거시/하위호환/마이그레이션 **없음** —
> 구설계 흔적을 남기지 말고 전 코드·문서·테스트를 신설계로 **일괄 최신화**한다.

---

## 1. 개념 토대 (왜 이렇게 가는가)

### 1.1 원래 Zettelkasten의 본질

- 가치는 **노트를 모으는 것**이 아니라 **노트 사이의 연결(link)에서 창발하는 구조**에 있다.
- 노트 타입(spark/source/permanent)은 **도메인 축이 아니라 노트의 역할·성숙도 축**이다.
  도메인(코딩/AI/경제/사회/일상…)은 **태그로 직교(orthogonal)** 표현한다.
- 따라서 "문헌(literature)"이 아니어도 모든 도메인에서 동작한다.

### 1.2 두 종류의 "novelty" (핵심 구분)

| | 세상에 대한 novelty | 내 지식망에 대한 novelty |
|---|---|---|
| 의미 | 인류 지식에 없던 것 (논문 Accept) | 내 언어로 결정화한 *내* 생각 노드 |
| 난이도 | 극히 드묾 | 일상적, 자주 |
| 위치 | **Project/산출물 수준** | **permanent 노트 수준** |

- **permanent의 기준은 후자다.** "세상에 새로운가?"가 아니라
  **"출처 맥락에서 떼어내 홀로 서는, 원자적·연결가능한 내 생각 노드로 만들었는가?"**
- permanent로 만드는 행위 = *발명*이 아니라 *연결·재사용 가능화*.
- 따라서 **permanent는 가장 흔한 durable 노트여야 한다.** 기준을 "논문급"으로 잡으면
  permanent가 안 쌓이고 → 연결망이 안 생기고 → 시스템이 작동하지 않는다 (ZK 대표 실패 모드).
- 세상-novelty(논문)는 permanent 연결망에서 창발해 **Project로 조립되는 출력**이다.

### 1.3 3층 구조 (PARA + ZK 통합)

```
PARA/Resources        Source 노트              Permanent 노트
(원문 그대로)     →    (내가 이해한 대로 정리)   →   (원자적 내 생각 노드)
raw original          my digest, 내 언어         source-independent idea
```

- **Resources** = 원문/참고자료 보관소 (클리핑·PDF·verbatim). PARA의 reference 층.
- **Source** = 그 원문을 *내 언어로 선별 정리* 한 것. **원문 복붙이 아님**(이해 과정의 산물).
- **Permanent** = 출처 없이도 홀로 서는 원자적 아이디어. permanent끼리 연결해 지식망 형성.
- 층은 **선택적**이다. 가벼운 자료는 Resource→Permanent 직행 가능, 원문을 Resources에
  안 남기고 Source만 독립 생성도 가능.

### 1.4 두 축, 두 연산

- **내부 축(내 사고)**: spark → permanent
- **외부 축(외부 자료 처리)**: resource → source → permanent

| 연산 | 경로 | 원본 | 의미 |
|---|---|---|---|
| **Distill** | spark → permanent | **소비/폐기** | 스파크를 증류해 영구노트로. 원본은 휴지통으로 |
| **Create** | source → permanent | 유지 | durable source에서 영구노트를 *새로* 만듦 |
| **Create** | resource → source | 유지 | 원문에서 내 소화를 만듦 |
| **Create** | resource → permanent | 유지 | 원문에서 직접 원자적 아이디어 추출 |

- `spark → source`는 **금지**한다: spark는 내부 스파크라 외부 출처에 anchor할 게 없다.
  (spark가 어떤 source를 *찾게* 만들 수는 있으나, 그건 **transform이 아니라 link**다.)
- 모든 길의 종착지는 **Permanent**. spark는 소비되어, source/resource는 남아서 permanent를 낳는다.

### 1.5 목표 그래프

```
Resource(원문)   ──create──►  Source(내 소화)
Resource(원문)   ──create──►  Permanent
Source(내 소화)  ──create──►  Permanent
Spark(스파크)    ──distill─►  Permanent        → spark는 휴지통으로(수동)
Permanent ──reference──► Permanent              (← 시스템의 본체)
[future] Permanent ──►  Project                 (논문 씨앗, 추후)
```

---

## 2. 명칭 결정

| 개념 | 기존 | 신규 | 비고 |
|---|---|---|---|
| 임시 메모 | fleeting / Fleeting / `zk_fleeting` | **spark / Spark / `zk_spark`** | ZK 표준은 "fleeting"이나 직관성 우선. "distill spark→permanent" 운율도 일관 |
| 외부 출처 소화 | literature / Literature / `zk_literature` | **source / Source / `zk_source`** | `sourceTitle` 필드와 일관, 도메인 무관 직관 |
| 영구 노트 | permanent / Permanent / `zk_permanent` | (유지) | 표준 유지. (별칭 "evergreen"은 채택 안 함) |

> 문서 한 줄로 매핑 안내 필요: "spark = fleeting note, source = literature note".

---

## 3. 타입별 명세

### 3.1 spark (`zk_spark`)

- 역할: 즉석 스파크 포착. **소비형(consumable)** — distill 후 폐기.
- frontmatter: `processed: false` 유지.
- **auto-todo 제거**: 기존 자동 삽입 task 2개(`refineFleetingAction`, `connectReferencesAction`) 삭제.
  - 이유: `processed:false` + 대시보드 "미처리 spark" 뷰가 이미 넛지. 지식-처리를 Tasks와
    섞으면 태스크 목록 오염. spark는 폐기되니 그 task도 휘발성 노이즈.
- managed 액션: **"Distill to Permanent"**. (폐기는 수동 액션, distill이 강제하지 않음 — §4 B1)

### 3.2 source (`zk_source`)

- 역할: 외부 출처를 내 언어로 선별 정리한 것. **durable**.
- frontmatter: 서지 필드 유지(`sourceTitle/authors/published/url`).
  - **결합 정책(B2)**: Resource에서 create 시 그 Resource를 reference로 자동 추가.
    원문을 Resources에 남길 땐 Resource 링크로 출처 표기, 가벼운 출처는 자체 서지필드.
    → 서지필드는 *선택*, Resource 링크로 대체 가능.
- managed 액션: **"Create Permanent"**.

### 3.3 permanent (`zk_permanent`)

- 역할: 원자적·연결가능한 내 생각 노드. **시스템의 주력 산출. 흔해야 한다.**
- frontmatter: `maturity`(기본 draft), `aliases` 유지.
  - maturity는 permanent가 *익어가는* 축이지, source→permanent 승격 게이트가 아니다.
- managed 액션:
  - 상향 transform 액션 **없음**(종착점). ← managed 블록 비대칭의 근원을 이렇게 정의해 해소.
  - **`cited_by` 파생 뷰**(permanent 한정): 백링크를 읽어 "이 노트를 인용한 노트들"을
    read-only로 렌더링. **데이터 복제 아님, 파생(derive).** (dataview/para-zk-view 패턴 활용)
  - [future] "→ Project" 버튼 (논문 씨앗 잇기).

---

## 4. 열린 질문에 대한 결정

- **B1 — spark 폐기 시점**: **수동 폐기**. distill이 자동 삭제하지 않는다.
  - 한 spark가 여러 permanent를 낳을 수 있으므로(1:N), "처리 완료" 시 사용자가 폐기.
  - 폐기 = **휴지통 이동(복구 가능)**. 하드삭제 금지.
  - **같은 spark에서 나온 permanent들의 상호 연결**: 자동 연결 금지.
    "공통 출처"는 개념적 관계가 아니다. *진짜 관계가 있을 때만* 이유를 담아 연결.
    distill 순간이 그 관계를 발견하기 좋은 타이밍이므로 *권유*하되 강제하지 않는다.

- **B2 — 참조/추적 메커니즘**:
  - **Add reference**로 ref 섹션에 `[[wikilink]]` 추가(백링크/그래프 호환).
  - 본문은 ref 섹션 인덱스를 **`[N]`** 으로 인용(산문 깔끔).
  - 연결의 **이유("왜")** 는 `[N]` 주변 산문 또는 ref 항목에 드러나야 한다(단순 마커 금지).
  - Resources에서 create 시 origin이 자동 reference로 추가됨(현 `insertReferenceItem` 동작과 일치).

- **B3 — resource create 대상**: **source / permanent 만**. (fleeting/spark 생성 제거)

- **B4 — 링크 방향 / 추적 통일**: **단방향 명시 링크 + 파생 백링크**.
  - 연결이 맥락상 가장 의미 있는 쪽(=인용하는 노트의 ref 섹션)에서 `[[wikilink]]`를 **한 번만** 명시.
  - 반대 방향은 Obsidian 백링크로 자동 제공 → **수동 양방향 복제 금지**(유지비만 증가).
  - 노트 안에서 cited-by가 필요하면 **백링크를 읽는 read-only 파생 뷰**로(§3.3, permanent 한정).
  - 결과: 모든 관계 = *단방향 reference* + *파생 백링크뷰*. 기존 `promoted_to` 류 frontmatter 복제 제거.

- **B5 — managed 블록 계약**: §3의 타입별 액션 정의로 확정.

---

## 5. 현재 코드 → 목표 매핑 (구현 체크리스트)

리네임(literature→source, fleeting→spark)이 토대이므로 광범위하게 퍼진다.

- `src/types.ts`
  - `ZkKind = "Fleeting"|"Literature"|"Permanent"` → `"Spark"|"Source"|"Permanent"`
  - `PromotionZkKind` 의미 재정의/제거 검토(연산이 distill/create로 갈리므로).
  - 폴더 설정: `fleetingFolder/literatureFolder` → `sparkFolder/sourceFolder`,
    기본값 `ZK/Fleeting`/`ZK/Literature` → `ZK/Spark`/`ZK/Source`.
- `src/zk/kinds.ts`
  - 코드/매핑(`fleeting|literature|permanent` → `spark|source|permanent`), 파서 갱신.
  - `parsePromotionKind`/`PROMOTION_ZK_KIND_*` 재검토(목적지 고정으로 단순화).
- `src/templates.ts`
  - 템플릿명 `zk_fleeting/zk_literature` → `zk_spark/zk_source`.
  - spark 템플릿에서 auto-task 삽입 제거.
  - dataview 뷰 키/라벨 정리: `fleeting-promotion`→distill, `literature-promotion`→create,
    `resource-zk-links`→create. permanent에 `cited_by` 뷰 추가.
- `src/workflows/promote.ts`
  - `promoteFleeting` → **`distillSpark`**(목적지 permanent 고정, spark→source 경로 제거,
    폐기는 별도 수동 액션).
  - `promoteLiterature` → **`createPermanentFromSource`**(원본 유지).
  - `promoteResource` → **`createFromResource`**(대상 source|permanent 한정).
  - `promoted_to` frontmatter 기록 제거(추적은 reference로 일원화).
- `src/workflows/create.ts` `createZkFile`: kind 매핑(Spark/Source/Permanent) 갱신.
- `src/workflows/locations.ts` `folderForZkKind`: 새 kind/폴더 매핑.
- `src/i18n.ts`, `src/props/schema.ts`, `src/ux/*`: 라벨/타입/뷰 렌더러 갱신.
  - 라벨: `promoteToZk/promote/createPermanent/refineFleetingAction/connectReferencesAction` 정리.
- `docs/examples/zk-fleeting.md|zk-literature.md` → `zk-spark.md|zk-source.md`, 내용 갱신.
- `docs/CLI.md`, `docs/MCP.md`, `docs/FIRST_READ.md`, `docs/CHANGELOG.md` 갱신.
- `tools/smoke-test-vault.mjs`: 타입명/폴더/액션/`cited_by` 검증 갱신.
- **마이그레이션 없음**: 미공개·미운용이므로 구 타입(`zk_fleeting/zk_literature`) 호환 코드·
  변환 스크립트·deprecation 일절 두지 않는다. 구 식별자는 전부 제거(흔적 남기지 않음).

---

## 6. 구현 순서

1. **리네임 토대**: literature→source, fleeting→spark (타입/kind/폴더/i18n/스키마/docs/smoke).
2. **연산 분리**: distill(소비) vs create(도출) + `spark→source` 경로 제거 + resource 대상 제한.
3. **spark 정리**: auto-todo 제거 + 수동 폐기(휴지통) 액션.
4. **추적 일원화**: `promoted_to` 제거, 단방향 reference + `[N]` 인용 정착.
5. **managed 계약 재정의**: 타입별 액션, permanent `cited_by` 파생 뷰.
6. **(future)** permanent → Project 잇기, maturity 단계 정의.

---

## 7. 미결/추후 논의

- permanent → Project 승격 경로·UI (논문 씨앗).
- `maturity` 단계 정의 (draft → ? → ?).
- source 서지필드 ↔ Resource 링크의 정확한 UI(둘 다 허용 시 입력 흐름).

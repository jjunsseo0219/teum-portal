# 틈 (Teum) 벤토 위젯 & 카드 추가 가이드 (AI / 개발자용 양식)

이 문서는 AI 코딩 에이전트나 개발자가 **틈(Teum)** 포털 홈 화면(6열 × `112px` 단위 벤토 그리드)에 새 위젯을 추가할 때 따라야 하는 표준 양식입니다.

---

## 1. 관련 파일 구조
| 파일 | 역할 |
| :--- | :--- |
| `widgets.js` | `WIDGET_META` (어드민 표시 정보) & `RENDERERS` (실제 위젯 DOM 생성) |
| `bento.js` | `DEFAULT_SPECS` (기본 좌표 `x, y`, 크기 `w, h`, 최소/최대 규격 `minW/minH/maxW/maxH`) |
| `app.js` | `buildHomeTopHero` (급식/시간표 코어 카드) & `renderFeed` (벤토 보드 마운트, `ctx` 전달) |
| `style.css` | `@media (min-width: 1024px)` 내 `.bento-tile` 내부 스크롤 및 `@container` 반응형 규칙 |
| `config.json` | `tabs.home` 기본 배치 위젯 목록 |
| `sources.json` | 위젯이 읽을 정적/API/NEIS/노션 데이터 소스 (`sourceKey`) |

---

## 2. 새 위젯 추가 4단계

### Step 1. `widgets.js`에 메타데이터와 렌더러 추가
1. `WIDGET_META` 객체에 위젯 타입을 등록합니다.
   ```js
   my_widget: {
     label: '위젯 표시 이름',
     icon: '아이콘명',
     description: '한 줄 설명',
     defaultSource: '', // sources.json 키가 있으면 입력
     defaultProps: { maxItems: 5 }
   }
   ```
2. `RENDERERS` 객체에 동일 키로 렌더러를 추가합니다.
   - 반드시 `createCardShell(widget, 'my-widget-card')`로 `<section class="widget-card ...">` 루트를 만듭니다.
   - 카드가 벤토 그리드 안에서 커지거나 줄어들 수 있으므로, 내부 목록 영역에는 **`flex: 1; min-height: 0; overflow-y: auto;`**가 적용될 수 있는 클래스(예: `.list-items`, `.text-body`, 또는 전용 클래스)를 둡니다.
   - 편집 모드에서 카드 클릭이 드래그와 충돌하지 않도록 `attachHalfSheetTrigger` 또는 `<button>`을 쓰되, `.bento-tile.is-edit-mode > :not(.bento-tile-bar):not(.bento-resize-handle)` 규칙으로 편집 중에는 자동으로 클릭이 비활성화됩니다.

### Step 2. `bento.js`에 기본 규격(`DEFAULT_SPECS` / `getSpec`) 등록
홈 화면은 **가로 6칸 (`COLS = 6`) × 세로 `112px` (`ROW_H = 112`)** 격자입니다.
```js
// bento.js > getSpec(item)
if (t === 'my_widget') {
  return { x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxW: 6, maxH: 5 };
}
```
- 특정 고정 ID(`DEFAULT_SPECS['home-my-widget']`)를 등록하면 초기 기본 좌표까지 지정할 수 있습니다.
- `w`: `2`(1/3폭), `3`(1/2폭), `4`(2/3폭), `6`(전체폭)을 주로 권장합니다.

### Step 3. `style.css`에 반응형 & 내부 맞춤 규칙 추가
`.bento-tile`에는 `container-type: inline-size`가 적용되어 있으므로, 카드 너비에 따라 내부 열 개수가 바뀌어야 하면 `@container`를 사용합니다.
```css
@media (min-width: 1024px) {
  .bento-tile .my-widget-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  @container (min-width: 440px) {
    .bento-tile .my-widget-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
```
- 카드 크기가 커질수록 더 많은 데이터를 보여주고 싶다면 `app.js`의 `state.homeLayout.items[id]`(`{ x, y, w, h }`)를 읽어 `w >= 3 || h >= 3`일 때 확장 렌더링하도록 구현합니다. (예: `오늘 급식`, `시간표` 코어 카드)

### Step 4. `config.json` / `sources.json` 등록 및 굽기
1. 외부/정적 데이터가 필요하면 `sources.json`에 소스를 추가합니다.
2. `config.json`의 `tabs.home` 배열에 위젯 인스턴스를 추가합니다.
   ```json
   {
     "id": "home-my-widget",
     "type": "my_widget",
     "enabled": true,
     "title": "새 위젯",
     "subtitle": "부제목",
     "sourceKey": "",
     "accent": "",
     "props": { "maxItems": 5 }
   }
   ```
3. `uv run python scripts/bake_data.py` 실행 후 `index.html`, `sw.js` 캐시 버전을 올립니다.

---

## 3. 학생 개인 커스텀 위젯을 나중에 붙일 때
현재는 관리자가 `config.json`에 등록한 위젯 풀 안에서 학생이 **위치 이동·크기 조절·숨기기**만 개인화(`localStorage` `teum_bento_v2`)합니다.
추후 학생이 직접 카드(예: 개인 메모장, 나만의 링크, D-Day 카운터)를 추가하게 하려면:
1. `localStorage`에 `teum_custom_widgets_v1` 배열(`{ id, type, title, props }`)을 저장하고,
2. `app.js`의 `renderFeed()`(`state.tab === 'home'`)에서 `allPool`에 `customItems`를 합쳐 `TEUM_BENTO.mountBentoBoard`에 넘기면 동일한 드래그/리사이즈가 바로 작동합니다.

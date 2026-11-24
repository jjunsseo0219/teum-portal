(function () {
  'use strict';

  const COLS = 6;
  const ROW_H = 112;
  const GAP = 14;
  const MAX_H = 6;

  const DEFAULT_SPECS = {
    'bento-meal': { x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxW: 6, maxH: 4 },
    'bento-timetable': { x: 2, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxW: 6, maxH: 4 },
    'home-planner': { x: 4, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxW: 6, maxH: 5 },
    'home-study-timer': { x: 0, y: 2, w: 2, h: 3, minW: 2, minH: 3, maxW: 6, maxH: 5 },
    'home-study-links': { x: 2, y: 2, w: 4, h: 3, minW: 2, minH: 2, maxW: 6, maxH: 6 },
    'home-carousel': { x: 0, y: 5, w: 6, h: 3, minW: 3, minH: 3, maxW: 6, maxH: 5 },
    'home-ticker': { x: 0, y: 8, w: 6, h: 1, minW: 2, minH: 1, maxW: 6, maxH: 2 }
  };

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function makeEl(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else node.setAttribute(k, String(v));
      }
    }
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) {
        c.forEach((n) => n && node.appendChild(typeof n === 'string' ? document.createTextNode(n) : n));
      } else {
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function getSpec(item, cols = COLS) {
    const id = item && item.id;
    const t = item && item.type;
    let base;
    if (cols <= 2) {
      if (id === 'bento-meal') base = { x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 2, maxW: 2, maxH: 4 };
      else if (id === 'bento-timetable') base = { x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 2, maxW: 2, maxH: 4 };
      else if (t === 'ticker') base = { x: 0, y: 0, w: 2, h: 1, minW: 1, minH: 1, maxW: 2, maxH: 2 };
      else if (t === 'study_timer') base = { x: 0, y: 0, w: 2, h: 3, minW: 1, minH: 3, maxW: 2, maxH: 5 };
      else if (t === 'study_links') base = { x: 0, y: 0, w: 2, h: 3, minW: 1, minH: 2, maxW: 2, maxH: 6 };
      else if (t === 'carousel') base = { x: 0, y: 0, w: 2, h: 3, minW: 1, minH: 3, maxW: 2, maxH: 5 };
      else base = { x: 0, y: 0, w: 2, h: 2, minW: 1, minH: 2, maxW: 2, maxH: 5 };
      return base;
    }
    if (id && DEFAULT_SPECS[id]) {
      base = { ...DEFAULT_SPECS[id] };
    } else {
      if (t === 'carousel') base = { x: 0, y: 0, w: 6, h: 3, minW: 3, minH: 3, maxW: 6, maxH: 5 };
      else if (t === 'ticker') base = { x: 0, y: 0, w: 6, h: 1, minW: 2, minH: 1, maxW: 6, maxH: 2 };
      else if (t === 'study_links') base = { x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2, maxW: 6, maxH: 6 };
      else if (t === 'study_timer') base = { x: 0, y: 0, w: 2, h: 3, minW: 2, minH: 3, maxW: 6, maxH: 5 };
      else base = { x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 1, maxW: 6, maxH: MAX_H };
    }
    if (item && Number(item.defaultW) >= 1) {
      base.w = clamp(Math.round(Number(item.defaultW)), base.minW, base.maxW);
    }
    if (item && Number(item.defaultH) >= 1) {
      base.h = clamp(Math.round(Number(item.defaultH)), base.minH, base.maxH);
    }
    return base;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolveCollisions(rects, activeId, cols = COLS) {
    const byId = new Map(rects.map((r) => [r.id, r]));
    const queue = [];

    if (activeId && byId.has(activeId)) {
      queue.push(activeId);
    } else {
      const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
      for (const r of sorted) queue.push(r.id);
    }

    let ops = 0;
    while (queue.length > 0 && ops < 600) {
      ops += 1;
      const blockerId = queue.shift();
      const blocker = byId.get(blockerId);
      if (!blocker) continue;

      const others = [...rects]
        .filter((r) => r.id !== blockerId && r.id !== activeId)
        .sort((a, b) => a.y - b.y || a.x - b.x);

      for (const other of others) {
        if (rectsOverlap(blocker, other)) {
          other.y = blocker.y + blocker.h;
          other.x = clamp(other.x, 0, Math.max(0, cols - other.w));
          queue.push(other.id);
        }
      }
    }
    return rects;
  }

  function findFirstFreeSlot(existing, w, h, cols = COLS) {
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x <= cols - w; x++) {
        const probe = { x, y, w, h };
        if (!existing.some((r) => rectsOverlap(probe, r))) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  function normalizeLayout(visiblePool, savedMap, cols = COLS) {
    const safeSaved = savedMap && typeof savedMap === 'object' ? savedMap : {};
    const placed = [];
    const unsaved = [];

    for (const item of visiblePool || []) {
      if (!item || !item.id) continue;
      const spec = getSpec(item, cols);
      const minW = clamp(spec.minW || 1, 1, cols);
      const maxW = clamp(spec.maxW || cols, minW, cols);
      const minH = Math.max(1, spec.minH || 1);
      const maxH = Math.max(minH, spec.maxH || MAX_H);
      const saved = safeSaved[item.id];

      if (saved && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y))) {
        const w = clamp(Math.round(Number(saved.w) || spec.w), minW, maxW);
        const h = clamp(Math.round(Number(saved.h) || spec.h), minH, maxH);
        const x = clamp(Math.round(Number(saved.x)), 0, Math.max(0, cols - w));
        const y = Math.max(0, Math.round(Number(saved.y)));
        placed.push({ id: item.id, x, y, w, h, minW, minH, maxW, maxH, item });
      } else {
        unsaved.push({ item, spec, minW, minH, maxW, maxH });
      }
    }

    for (const entry of unsaved) {
      const { item, spec, minW, minH, maxW, maxH } = entry;
      const w = clamp(spec.w, minW, maxW);
      const h = clamp(spec.h, minH, maxH);
      const defX = clamp(spec.x || 0, 0, Math.max(0, cols - w));
      const defY = Math.max(0, spec.y || 0);
      const probe = { x: defX, y: defY, w, h };
      const freeAtDefault = !placed.some((r) => rectsOverlap(probe, r));
      const pos = freeAtDefault ? { x: defX, y: defY } : findFirstFreeSlot(placed, w, h, cols);
      placed.push({ id: item.id, x: pos.x, y: pos.y, w, h, minW, minH, maxW, maxH, item });
    }

    resolveCollisions(placed, null, cols);
    return placed;
  }

  function compactLayout(rects, cols = COLS) {
    const cloned = (rects || []).map((r) => ({ ...r }));
    cloned.sort((a, b) => a.y - b.y || a.x - b.x);
    const settled = [];
    for (const r of cloned) {
      r.x = clamp(r.x, 0, Math.max(0, cols - r.w));
      while (r.y > 0) {
        const probe = { ...r, y: r.y - 1 };
        if (settled.some((s) => rectsOverlap(probe, s))) break;
        r.y -= 1;
      }
      settled.push(r);
    }
    return settled;
  }

  function toSavedMap(rects) {
    const map = {};
    for (const r of rects) {
      map[r.id] = { x: r.x, y: r.y, w: r.w, h: r.h };
    }
    return map;
  }

  function applyRectToEl(cardEl, rect) {
    cardEl.style.setProperty('--bx', String(rect.x + 1));
    cardEl.style.setProperty('--by', String(rect.y + 1));
    cardEl.style.setProperty('--bw', String(rect.w));
    cardEl.style.setProperty('--bh', String(rect.h));
    const pill = cardEl.querySelector('.bento-size-pill');
    if (pill) pill.textContent = `${rect.w}×${rect.h}`;
  }

  function renderGuides(guideLayer, rows, cols = COLS) {
    const total = cols * rows;
    if (guideLayer.childElementCount === total) return;
    const cells = [];
    for (let i = 0; i < total; i++) {
      cells.push(makeEl('div', { className: 'bento-guide-cell', 'aria-hidden': 'true' }));
    }
    guideLayer.replaceChildren(...cells);
  }

  function mountBentoBoard({ boardEl, visiblePool, savedMap, editMode, cols = COLS, rowH = ROW_H, gap = GAP, onCommit, onHide }) {
    const rects = normalizeLayout(visiblePool, savedMap, cols);
    rects.sort((a, b) => a.y - b.y || a.x - b.x);

    const rectById = new Map(rects.map((r) => [r.id, r]));
    const tileMap = new Map();

    let guideLayer = null;
    let ghostEl = null;
    let ghostLabel = null;
    let currentGuideRows = Math.max(6, ...rects.map((r) => r.y + r.h)) + 1;

    if (editMode) {
      guideLayer = makeEl('div', { className: 'bento-grid-guides', 'aria-hidden': 'true' });
      renderGuides(guideLayer, currentGuideRows, cols);
      boardEl.appendChild(guideLayer);

      ghostLabel = makeEl('span', { className: 'bento-ghost-label' }, '');
      ghostEl = makeEl('div', { className: 'bento-ghost', hidden: true }, ghostLabel);
      boardEl.appendChild(ghostEl);
    }

    const showGhost = (r) => {
      if (!ghostEl) return;
      ghostEl.hidden = false;
      ghostEl.style.setProperty('--gx', String(r.x + 1));
      ghostEl.style.setProperty('--gy', String(r.y + 1));
      ghostEl.style.setProperty('--gw', String(r.w));
      ghostEl.style.setProperty('--gh', String(r.h));
      if (ghostLabel) ghostLabel.textContent = `${r.w} × ${r.h}`;
    };

    const hideGhost = () => {
      if (ghostEl) ghostEl.hidden = true;
    };

    const syncLiveBoard = (working, activeId) => {
      for (const r of working) {
        if (r.id === activeId) continue;
        const t = tileMap.get(r.id);
        if (t) applyRectToEl(t, r);
      }
      if (guideLayer) {
        const neededRows = Math.max(6, ...working.map((r) => r.y + r.h)) + 1;
        if (neededRows > currentGuideRows) {
          currentGuideRows = neededRows;
          renderGuides(guideLayer, currentGuideRows, cols);
        }
      }
    };

    for (const r of rects) {
      const card = r.item.render();
      card.classList.add('bento-tile');
      card.setAttribute('data-bento-id', r.id);
      applyRectToEl(card, r);
      tileMap.set(r.id, card);

      if (editMode) {
        card.classList.add('is-edit-mode');
        const hideBtn = makeEl('button', {
          type: 'button',
          className: 'bento-hide-btn',
          'aria-label': `${r.item.title || r.id} 숨기기`
        }, '숨기기');
        hideBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onHide) onHide(r.id);
        });

        const bar = makeEl('div', { className: 'bento-tile-bar' },
          makeEl('span', { className: 'bento-tile-handle' }, `⋮⋮ ${r.item.title || r.id}`),
          makeEl('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 } },
            makeEl('span', { className: 'bento-size-pill' }, `${r.w}×${r.h}`),
            hideBtn
          )
        );
        card.prepend(bar);

        const handle = makeEl('div', {
          className: 'bento-resize-handle',
          role: 'button',
          tabindex: '0',
          'aria-label': `${r.item.title || r.id} 크기 조절`,
          title: '모서리를 끌어 크기 조절'
        });
        card.appendChild(handle);

        // Drag-to-move anywhere on tile (except hide button and resize handle)
        card.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (e.target.closest('.bento-hide-btn, .bento-resize-handle')) return;
          const cur = rectById.get(r.id);
          if (!cur) return;

          const boardRect = boardEl.getBoundingClientRect();
          const colStep = (boardRect.width + gap) / cols;
          const rowStep = rowH + gap;
          const startX = e.clientX;
          const startY = e.clientY;
          let activated = false;
          let lastTargetX = cur.x;
          let lastTargetY = cur.y;
          let working = rects.map((itemRect) => ({ ...itemRect }));

          try {
            card.setPointerCapture(e.pointerId);
          } catch (_err) {}

          const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!activated) {
              if (Math.hypot(dx, dy) <= 4) return;
              activated = true;
              card.classList.add('is-dragging');
              showGhost(cur);
            }
            card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

            const nextX = clamp(Math.round(cur.x + dx / colStep), 0, cols - cur.w);
            const nextY = Math.max(0, Math.round(cur.y + dy / rowStep));
            if (nextX !== lastTargetX || nextY !== lastTargetY) {
              lastTargetX = nextX;
              lastTargetY = nextY;
              working = rects.map((itemRect) => ({ ...itemRect }));
              const active = working.find((wItem) => wItem.id === r.id);
              if (active) {
                active.x = nextX;
                active.y = nextY;
                resolveCollisions(working, r.id, cols);
                showGhost(active);
                syncLiveBoard(working, r.id);
              }
            }
          };

          const onUp = (ev) => {
            card.removeEventListener('pointermove', onMove);
            card.removeEventListener('pointerup', onUp);
            card.removeEventListener('pointercancel', onUp);
            try {
              if (card.hasPointerCapture(ev.pointerId)) card.releasePointerCapture(ev.pointerId);
            } catch (_err) {}
            card.style.transform = '';
            card.classList.remove('is-dragging');
            hideGhost();

            if (activated) {
              working.forEach((wItem) => {
                const target = rectById.get(wItem.id);
                if (target) Object.assign(target, wItem);
                const elTile = tileMap.get(wItem.id);
                if (elTile) applyRectToEl(elTile, wItem);
              });
              if (onCommit) onCommit(toSavedMap(working));
            }
          };

          card.addEventListener('pointermove', onMove);
          card.addEventListener('pointerup', onUp);
          card.addEventListener('pointercancel', onUp);
        });

        // Bottom-right corner drag-to-resize
        handle.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();

          const cur = rectById.get(r.id);
          if (!cur) return;

          const boardRect = boardEl.getBoundingClientRect();
          const colStep = (boardRect.width + gap) / cols;
          const rowStep = rowH + gap;
          const startX = e.clientX;
          const startY = e.clientY;
          const startPxW = card.offsetWidth;
          const startPxH = card.offsetHeight;
          let lastW = cur.w;
          let lastH = cur.h;
          let working = rects.map((itemRect) => ({ ...itemRect }));

          try {
            handle.setPointerCapture(e.pointerId);
          } catch (_err) {}

          card.classList.add('is-resizing');
          showGhost(cur);

          const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const minPxW = cur.minW * colStep - gap;
            const maxPxW = Math.min(cur.maxW, cols - cur.x) * colStep - gap;
            const minPxH = cur.minH * rowStep - gap;
            const maxPxH = cur.maxH * rowStep - gap;

            card.style.width = `${clamp(startPxW + dx, Math.min(120, minPxW), Math.max(startPxW, maxPxW + 18))}px`;
            card.style.height = `${clamp(startPxH + dy, Math.min(84, minPxH), Math.max(startPxH, maxPxH + 18))}px`;

            const nextW = clamp(Math.round((startPxW + dx + gap) / colStep), cur.minW, Math.min(cur.maxW, cols - cur.x));
            const nextH = clamp(Math.round((startPxH + dy + gap) / rowStep), cur.minH, cur.maxH);

            if (nextW !== lastW || nextH !== lastH) {
              lastW = nextW;
              lastH = nextH;
              working = rects.map((itemRect) => ({ ...itemRect }));
              const active = working.find((wItem) => wItem.id === r.id);
              if (active) {
                active.w = nextW;
                active.h = nextH;
                resolveCollisions(working, r.id, cols);
                showGhost(active);
                syncLiveBoard(working, r.id);
                const pill = card.querySelector('.bento-size-pill');
                if (pill) pill.textContent = `${nextW}×${nextH}`;
              }
            }
          };

          const onUp = (ev) => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            try {
              if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
            } catch (_err) {}

            card.style.width = '';
            card.style.height = '';
            card.classList.remove('is-resizing');
            hideGhost();

            if (lastW !== cur.w || lastH !== cur.h) {
              working.forEach((wItem) => {
                const target = rectById.get(wItem.id);
                if (target) Object.assign(target, wItem);
                const elTile = tileMap.get(wItem.id);
                if (elTile) applyRectToEl(elTile, wItem);
              });
              if (onCommit) onCommit(toSavedMap(working));
            }
          };

          handle.addEventListener('pointermove', onMove);
          handle.addEventListener('pointerup', onUp);
          handle.addEventListener('pointercancel', onUp);
        });
      }

      boardEl.appendChild(card);
    }

    return {
      rects,
      compact() {
        const compacted = compactLayout(rects, cols);
        if (onCommit) onCommit(toSavedMap(compacted));
      }
    };
  }

  window.TEUM_BENTO = {
    COLS,
    ROW_H,
    GAP,
    DEFAULT_SPECS,
    getSpec,
    rectsOverlap,
    resolveCollisions,
    normalizeLayout,
    compactLayout,
    mountBentoBoard
  };
})();

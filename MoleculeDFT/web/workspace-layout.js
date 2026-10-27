(() => {
  'use strict';
  const divider = document.getElementById('resultsDivider');
  const panel = document.getElementById('resultsPanel');
  const canvas = document.getElementById('canvasArea');
  const key = 'molecule-dft-results-height';
  let drag = null;
  let preferred = null;
  try { const value = Number(localStorage.getItem(key)); if (value >= 60) preferred = value; } catch (_) {}
  const height = () => panel.getBoundingClientRect().height;
  function apply(value) {
    const max = Math.max(60, height() + canvas.getBoundingClientRect().height - 220);
    const next = Math.round(Math.max(60, Math.min(max, value)));
    panel.style.height = `${next}px`;
    divider.setAttribute('aria-valuemin', '60');
    divider.setAttribute('aria-valuemax', String(Math.round(max)));
    divider.setAttribute('aria-valuenow', String(next));
    divider.setAttribute('aria-valuetext', `計算結果の高さ ${next} ピクセル`);
  }
  function save() {
    preferred = height();
    try { localStorage.setItem(key, String(preferred)); } catch (_) {}
  }
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); divider.focus();
    drag = {id:event.pointerId, y:event.clientY, height:height()};
    try { divider.setPointerCapture(event.pointerId); } catch (_) {}
    divider.classList.add('dragging');
  });
  divider.addEventListener('pointermove', event => {
    if (drag && event.pointerId === drag.id) apply(drag.height - (event.clientY - drag.y));
  });
  function finish(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (event.type === 'pointercancel') apply(drag.height);
    else if (event.type === 'pointerup') apply(drag.height - (event.clientY - drag.y));
    const id = drag.id; drag = null;
    divider.classList.remove('dragging');
    if (divider.hasPointerCapture(id)) divider.releasePointerCapture(id);
    save();
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => divider.addEventListener(type, finish));
  divider.addEventListener('dblclick', () => {
    preferred = null; panel.style.height = '';
    try { localStorage.removeItem(key); } catch (_) {}
    apply(height());
  });
  divider.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    apply(event.key === 'Home' ? 60 : event.key === 'End' ? 100000 : height() + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 50 : 20));
    save();
  });
  new ResizeObserver(() => { if (!drag) apply(preferred ?? height()); }).observe(document.querySelector('.editor-column'));
  apply(preferred ?? height());
})();

(function () {
  if (window.__kenjiVisualEditor) return;
  window.__kenjiVisualEditor = true;

  let sel = null;
  let editCount = 0;

  const hud = document.createElement('div');
  hud.id = 'kenji-editor';
  Object.assign(hud.style, {
    position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483647,
    background: 'rgba(17,24,39,.95)', color: '#e5e7eb',
    font: '13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif',
    padding: '12px 14px', borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)', maxWidth: '360px',
  });
  hud.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <strong style="color:#fff">Kenji Editor</strong>
      <span id="ke-edits" style="font-size:11px;color:#93c5fd"></span>
    </div>
    <div id="ke-target" style="color:#9ca3af;font-size:12px;margin-top:2px">Click an element to select it.</div>
    <div id="ke-note" style="font-size:12px;color:#a7f3d0;min-height:18px;margin-top:2px"></div>
    <div style="margin-top:6px;display:flex;gap:8px">
      <button id="ke-commit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer">Commit and push</button>
      <button id="ke-revert" style="background:#374151;color:#e5e7eb;border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer">Revert file</button>
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:8px">
      arrows nudge padding +4px &middot; Shift &minus;4px &middot; Alt margin &middot; &#8984;/Ctrl &plusmn;1px &middot; Esc deselect &middot; Alt-click follows links
    </div>`;
  document.documentElement.appendChild(hud);

  const $ = (id) => hud.querySelector('#' + id);
  const note = (msg, bad) => {
    $('ke-note').textContent = msg;
    $('ke-note').style.color = bad ? '#fca5a5' : '#a7f3d0';
  };
  const updEdits = () => { $('ke-edits').textContent = editCount ? `${editCount} edit${editCount === 1 ? '' : 's'}` : ''; };

  function labelFor(el) {
    const parts = [];
    let c = el;
    while (c && c !== document.body && parts.length < 3) {
      let p = c.tagName.toLowerCase();
      if (c.id) p += '#' + c.id;
      else if (typeof c.className === 'string' && c.className.trim())
        p += '.' + c.className.trim().split(/\s+/).slice(0, 2).join('.');
      parts.unshift(p);
      c = c.parentElement;
    }
    return parts.join(' > ');
  }

  /* Flatten every style rule, depth-first, same order the server parses from the file */
  function flatten(ruleList, out = []) {
    for (const r of ruleList) {
      if (r.style && !('keyText' in r)) out.push(r);
      if (r.cssRules) flatten(r.cssRules, out);
    }
    return out;
  }
  function allRules() {
    return [...document.styleSheets].flatMap((s) => {
      try { return flatten(s.cssRules); } catch { return []; }
    });
  }

  function select(el) {
    deselect();
    sel = el;
    el.classList.add('ke-selected');
    $('ke-target').textContent = labelFor(el);
    note('');
  }
  function deselect() {
    if (sel) sel.classList.remove('ke-selected');
    sel = null;
    $('ke-target').textContent = 'Click an element to select it.';
  }

  const styleEl = document.createElement('style');
  styleEl.textContent = '.ke-selected{outline:2px solid #2563eb !important;outline-offset:-2px;}';
  document.head.appendChild(styleEl);

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#kenji-editor')) return;
    if (e.altKey || e.metaKey || e.ctrlKey) return; /* pass clicks through to real links */
    e.preventDefault();
    e.stopPropagation();
    select(e.target);
  }, true);

  async function nudgeProp(prop, delta) {
    if (!sel) return;
    const rules = allRules();
    let idx = -1;
    for (let i = rules.length - 1; i >= 0; i--) {
      try { if (sel.matches(rules[i].selectorText)) { idx = i; break; } } catch {}
    }
    if (idx === -1) { note('No CSS rule matched that element; inline styles are not covered yet.', true); return; }

    const cssRule = rules[idx];
    const camel = prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    const current = parseFloat(getComputedStyle(sel)[camel]) || 0;
    const value = Math.max(0, Math.round(current + delta)) + 'px';

    const before = cssRule.style.getPropertyValue(prop);
    cssRule.style.setProperty(prop, value, cssRule.style.getPropertyPriority(prop) || undefined);

    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx, selector: cssRule.selectorText, prop, value }),
    });
    if (!res.ok || !(await res.json()).ok) {
      cssRule.style.setProperty(prop, before); /* roll back the visual change */
      note('Out of sync with css/style.css. Reload the page and try again.', true);
      return;
    }
    editCount++;
    updEdits();
    note(`${prop}: ${value}`);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') { deselect(); return; }
    if (!sel || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const prefix = e.altKey ? 'margin' : 'padding';
    const side = { ArrowUp: 'top', ArrowDown: 'bottom', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (!side) return;
    const prop = `${prefix}-${side}`;
    const step = e.metaKey || e.ctrlKey ? 1 : 4;
    nudgeProp(prop, e.shiftKey ? -step : step);
  });

  $('ke-commit').onclick = async () => {
    if (!editCount) { note('Nothing to commit yet.'); return; }
    note('Committing and pushing…');
    const res = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Visual nudges: ${editCount} change${editCount === 1 ? '' : 's'}` }),
    });
    const data = await res.json();
    if (data.ok) { note(`Pushed. ${data.output || 'Vercel is deploying.'}`); editCount = 0; updEdits(); }
    else note(data.error || 'Commit failed. Check the terminal.', true);
  };

  $('ke-revert').onclick = async () => {
    await fetch('/api/discard', { method: 'POST' });
    note('File reverted. Reloading…');
    setTimeout(() => location.reload(), 400);
  };
})();

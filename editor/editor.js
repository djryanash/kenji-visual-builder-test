(function () {
  if (window.__kenjiVisualEditor) return;
  window.__kenjiVisualEditor = true;

  const DIMENSIONS = [
    'width', 'height', 'font-size', 'line-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  ];

  /* every property the all-properties view lists, by group */
  const ALL_PROPS = {
    'layout & display': ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear', 'overflow', 'overflow-x', 'overflow-y', 'visibility', 'opacity', 'box-sizing', 'aspect-ratio'],
    'flexbox': ['flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'gap', 'row-gap', 'column-gap', 'order'],
    'grid': ['grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow', 'place-items'],
    'spacing & size': ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'object-fit'],
    'typography': ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration-line', 'text-transform', 'text-indent', 'white-space', 'word-break', 'text-shadow', 'vertical-align'],
    'background & borders': ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'border', 'border-radius', 'border-top', 'border-bottom', 'outline', 'outline-offset', 'box-shadow', 'filter', 'transform', 'cursor'],
  };
  let viewMode = 'box';

  let sel = null;
  let editCount = 0;
  let overlayOn = false;

  /* ---------------- activity log ---------------- */
  const LOG_KEY = 'kenji-editor-log';
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch {}
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let logBox;
  const renderLog = () => {
    if (!logBox) return;
    logBox.innerHTML = logs.slice(-60)
      .map((l) => `<div style="color:${l.bad ? '#fca5a5' : '#9ecffa'}">${escapeHtml(l.t + '  ' + l.msg)}</div>`).join('');
    logBox.scrollTop = logBox.scrollHeight;
  };
  function pushLog(msg, bad) {
    logs.push({ t: new Date().toLocaleTimeString(), msg, bad: !!bad });
    logs = logs.slice(-100);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch {}
    renderLog();
  }
  window.kenjiEditorLog = () => logs.map((l) => `${l.t} ${l.bad ? '[!]' : ''} ${l.msg}`).join('\n');

  /* ---------------- HUD ---------------- */
  const hud = document.createElement('div');
  hud.id = 'kenji-editor';
  Object.assign(hud.style, {
    position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483647,
    background: 'rgba(17,24,39,.95)', color: '#e5e7eb',
    font: '13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif',
    padding: '12px 14px', borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)', maxWidth: '380px',
  });
  hud.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <strong style="color:#fff">Kenji Editor</strong>
      <span id="ke-edits" style="font-size:11px;color:#93c5fd"></span>
      <span style="flex:1"></span>
      <button id="ke-overlay" style="background:#1f2937;color:#e5e7eb;border:0;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer">overlay</button>
      <button id="ke-togglelog" style="background:#1f2937;color:#9ca3af;border:0;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer">log</button>
      <button id="ke-copylog" style="background:#1f2937;color:#9ca3af;border:0;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer">copy</button>
    </div>
    <div id="ke-target" style="color:#9ca3af;font-size:12px;margin-top:2px">Click an element to select it.</div>
    <div id="ke-note" style="font-size:12px;color:#a7f3d0;min-height:18px;margin-top:2px"></div>
    <div id="ke-loglist" style="display:none;background:#0b1220;border-radius:8px;margin-top:6px;padding:6px 8px;height:150px;overflow:auto;font:10.5px/1.5 ui-monospace, monospace;white-space:pre-wrap"></div>
    <div style="margin-top:6px;display:flex;gap:8px">
      <button id="ke-commit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer">Commit and push</button>
      <button id="ke-revert" style="background:#374151;color:#e5e7eb;border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer">Revert file</button>
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:8px">
      overlay: box shows dimensions, alignment buttons set text-align and flex centering &middot; all shows every CSS property, searchable &middot; click a value to type, up/down to &plusmn;1px (Shift &plusmn;10) &middot; Esc deselect &middot; Alt-click follows links
    </div>`;
  document.documentElement.appendChild(hud);

  /* ---------------- floating dimensions panel ---------------- */
  const panel = document.createElement('div');
  panel.id = 'kenji-panel';
  panel.style.display = 'none';
  Object.assign(panel.style, {
    position: 'fixed', zIndex: 2147483646, minWidth: '230px',
    background: 'rgba(17,24,39,.97)', color: '#e5e7eb',
    font: '12px/1.6 -apple-system, BlinkMacSystemFont, sans-serif',
    padding: '10px 12px', borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)', maxHeight: '70vh', overflow: 'auto',
  });
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
      <div id="ke-panel-title" style="color:#93c5fd;font-size:11px;overflow:hidden;text-overflow:ellipsis">selected</div>
      <span style="display:flex;gap:4px;flex:none">
        <button id="ke-tab-box" class="ke-tab" style="cursor:pointer;border:0;border-radius:6px;padding:2px 10px;font-size:11px;background:#2563eb;color:#fff">box</button>
        <button id="ke-tab-all" class="ke-tab" style="cursor:pointer;border:0;border-radius:6px;padding:2px 10px;font-size:11px;background:#1f2937;color:#9ca3af">all</button>
      </span>
    </div>
    <div id="ke-filterwrap" style="display:none;margin-bottom:5px">
      <input id="ke-filter" placeholder="filter properties…" style="width:100%;box-sizing:border-box;background:#111c33;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:3px 8px;font:11.5px -apple-system, sans-serif;outline:none">
    </div>
    <div id="ke-rows"></div>
    <div id="ke-align">
    <div style="color:#93c5fd;font-size:11px;margin:6px 0 4px">alignment</div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <span style="color:#9ca3af;width:10px">h</span>
      <button class="ke-albtn" data-axis="h" data-val="left" style="cursor:pointer;border:0;border-radius:5px;padding:1px 9px;font:11px -apple-system, sans-serif;background:#0b1220;color:#a7f3d0">left</button>
      <button class="ke-albtn" data-axis="h" data-val="center" style="cursor:pointer;border:0;border-radius:5px;padding:1px 9px;font:11px -apple-system, sans-serif;background:#0b1220;color:#a7f3d0">center</button>
      <button class="ke-albtn" data-axis="h" data-val="right" style="cursor:pointer;border:0;border-radius:5px;padding:1px 9px;font:11px -apple-system, sans-serif;background:#0b1220;color:#a7f3d0">right</button>
      <span style="color:#6b7280;font-size:10px">text-align</span>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <span style="color:#9ca3af;width:10px">v</span>
      <button class="ke-albtn" data-axis="v" data-val="top" style="cursor:pointer;border:0;border-radius:5px;padding:1px 9px;font:11px -apple-system, sans-serif;background:#0b1220;color:#a7f3d0">top</button>
      <button class="ke-albtn" data-axis="v" data-val="center" style="cursor:pointer;border:0;border-radius:5px;padding:1px 9px;font:11px -apple-system, sans-serif;background:#0b1220;color:#a7f3d0">center</button>
      <button class="ke-albtn" data-axis="v" data-val="bottom" style="cursor:pointer;border:0;border-radius:5px;padding:1px 9px;font:11px -apple-system, sans-serif;background:#0b1220;color:#a7f3d0">bottom</button>
      <span style="color:#6b7280;font-size:10px">flex + align-items</span>
    </div></div>`;
  document.documentElement.appendChild(panel);

  const $ = (id) => hud.querySelector('#' + id) || document.getElementById(id); /* HUD and panel both live in the DOM */
  const note = (msg, bad) => {
    $('ke-note').textContent = msg;
    $('ke-note').style.color = bad ? '#fca5a5' : '#a7f3d0';
  };
  const updEdits = () => { $('ke-edits').textContent = editCount ? `${editCount} edit${editCount === 1 ? '' : 's'}` : ''; };
  logBox = $('ke-loglist');
  renderLog();
  $('ke-togglelog').onclick = () => {
    logBox.style.display = logBox.style.display === 'none' ? 'block' : 'none';
  };
  $('ke-copylog').onclick = () => {
    note('Log copied to clipboard.');
    try { navigator.clipboard.writeText(window.kenjiEditorLog()); } catch {}
    if (window.parent === window) console.log(window.kenjiEditorLog());
  };

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

  /* style rules, depth-first, same order the server parses from the file.
     The editor's own stylesheets are skipped so they can never win a match.  */
  let styleEl;
  function flatten(ruleList, out = []) {
    for (const r of ruleList) {
      if (r.style && !('keyText' in r)) out.push(r);
      if (r.cssRules) flatten(r.cssRules, out);
    }
    return out;
  }
  function allRules() {
    return [...document.styleSheets].flatMap((s) => {
      if (s.ownerNode === styleEl || s.ownerNode === hud || s.ownerNode === panel) return [];
      try { return flatten(s.cssRules); } catch { return []; }
    });
  }

  /* prefer a rule that already declares the property; else the last matching rule */
  function ruleForProp(el, prop) {
    const rules = allRules();
    for (let i = rules.length - 1; i >= 0; i--) {
      try {
        if (el.matches(rules[i].selectorText) && rules[i].style.getPropertyValue(prop).trim())
          return { rule: rules[i], index: i, replaced: true };
      } catch {}
    }
    for (let i = rules.length - 1; i >= 0; i--) {
      try { if (el.matches(rules[i].selectorText)) return { rule: rules[i], index: i, replaced: false }; } catch {}
    }
    return null;
  }

  const camel = (prop) => prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  const computedPx = (prop) => parseFloat(getComputedStyle(sel)[camel(prop)]) || 0;
  const fmtVal = (prop) => {
    const v = parseFloat(getComputedStyle(sel)[camel(prop)]) || 0;
    return (Math.round(v * 10) / 10) + 'px';
  };

  function select(el) {
    deselect();
    sel = el;
    el.classList.add('ke-selected');
    $('ke-target').textContent = labelFor(el);
    note('');
    pushLog(`select ${labelFor(el)}`);
    if (overlayOn) renderPanel(false);
  }
  function deselect() {
    if (sel) sel.classList.remove('ke-selected');
    sel = null;
    $('ke-target').textContent = 'Click an element to select it.';
    panel.style.display = 'none';
  }

  styleEl = document.createElement('style');
  styleEl.textContent =
    '.ke-selected{outline:2px solid #2563eb !important;outline-offset:-2px;}' +
    /* the editor UI must always sit above every page layer, however they stack */
    '#kenji-editor,#kenji-panel{position:fixed !important;pointer-events:auto;}' +
    '#kenji-editor{z-index:2147483647 !important;}' +
    '#kenji-panel{z-index:2147483646 !important;}';
  document.head.appendChild(styleEl);

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#kenji-editor,#kenji-panel')) return;
    if (e.altKey || e.metaKey || e.ctrlKey) return; /* pass clicks through to real links */
    e.preventDefault();
    e.stopPropagation();
    select(e.target);
  }, true);

  /* ---------------- overlay panel rendering ---------------- */
  function rowHtml(prop, fmt) {
    return `<div class="ke-row" style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:1px 0">
      <span style="color:#9ca3af">${prop}</span>
      <span class="ke-val ke-fmt-${fmt}" data-prop="${prop}" data-fmt="${fmt}" tabindex="0" role="button"
        style="cursor:pointer;background:#0b1220;border-radius:5px;padding:1px 7px;font:11px ui-monospace, monospace;color:#a7f3d0;max-width:150px;overflow:hidden;text-overflow:ellipsis"></span>
    </div>`;
  }
  function rowValue(prop, fmt) {
    const computed = getComputedStyle(sel).getPropertyValue(prop).trim();
    return fmt === 'px' ? fmtVal(prop) : computed;
  }
  function positionPanel() {
    if (!sel || panel.style.display === 'none') return;
    const r = sel.getBoundingClientRect();
    let left = r.right + 12, top = r.top;
    if (left + 250 > innerWidth) left = Math.max(8, r.left - 260);
    if (left + 250 > innerWidth) left = 24;
    top = Math.min(Math.max(8, top), innerHeight - panel.offsetHeight - 8);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';

    /* keep the panel clear of the HUD: its buttons must stay clickable at all times */
    const hudRect = hud.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const overlapsHud =
      p.left < hudRect.right && p.right > hudRect.left &&
      p.top < hudRect.bottom && p.bottom > hudRect.top;
    if (overlapsHud) {
      const aboveHud = hudRect.top - p.height - 10;
      if (aboveHud > 8) panel.style.top = aboveHud + 'px';
      else panel.style.left = hudRect.right + 12 + 'px';
    }
  }

  function renderPanel(refreshValuesOnly) {
    if (!sel) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    document.getElementById('ke-panel-title').textContent = labelFor(sel);
    document.getElementById('ke-tab-box').style.background = viewMode === 'box' ? '#2563eb' : '#1f2937';
    document.getElementById('ke-tab-box').style.color = '#fff';
    document.getElementById('ke-tab-all').style.background = viewMode === 'all' ? '#2563eb' : '#1f2937';
    document.getElementById('ke-tab-all').style.color = '#fff';
    document.getElementById('ke-filterwrap').style.display = viewMode === 'all' ? 'block' : 'none';
    document.getElementById('ke-align').style.display = viewMode === 'box' ? 'block' : 'none';
    const rows = document.getElementById('ke-rows');
    if (!refreshValuesOnly) {
      if (viewMode === 'box') {
        rows.innerHTML = DIMENSIONS.map((p) => rowHtml(p, 'px')).join('');
      } else {
        const q = document.getElementById('ke-filter').value.trim().toLowerCase();
        rows.innerHTML = Object.entries(ALL_PROPS).map(([group, props]) => {
          const hits = props.filter((p) => !q || p.includes(q));
          if (!hits.length) return '';
          return `<div style="color:#93c5fd;font-size:10.5px;margin:5px 0 2px">${group}</div>` +
            hits.map((p) => rowHtml(p, 'raw')).join('');
        }).join('') || '<div style="color:#6b7280;font-size:11px">no properties match the filter</div>';
      }
      rows.querySelectorAll('.ke-val').forEach((v) => {
        v.onclick = () => startEdit(v, v.dataset.prop);
        v.onkeydown = (e) => { /* space/enter opens the input too */
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(v, v.dataset.prop); }
        };
      });
      panel.querySelectorAll('.ke-albtn').forEach((b) => {
        b.onclick = () => setAlignment(b.dataset.axis, b.dataset.val);
      });
    }
    rows.querySelectorAll('[data-prop]').forEach((v) => {
      if (v.classList.contains('ke-val') && !v.querySelector('input'))
        v.textContent = rowValue(v.dataset.prop, v.dataset.fmt);
    });
    refreshAlignment();
    positionPanel();
  }

  function setView(mode) {
    if (viewMode === mode) return;
    viewMode = mode;
    pushLog(`panel view: ${mode}`);
    renderPanel(false);
  }

  /* alignment buttons: horizontal = text-align, vertical = flex + align-items.
     Active states are derived from computed styles so the truth is always on screen.  */
  const TA_MAP = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right' };
  const AI_MAP = { 'flex-start': 'top', center: 'center', 'flex-end': 'bottom' };
  function refreshAlignment() {
    if (!sel) return;
    const cs = getComputedStyle(sel);
    const ta = TA_MAP[cs.textAlign] || '';
    const ai = cs.display === 'flex' ? AI_MAP[cs.alignItems] || '' : '';
    panel.querySelectorAll('.ke-albtn').forEach((b) => {
      const active = b.dataset.axis === 'h' ? ta === b.dataset.val : ai === b.dataset.val;
      b.style.background = active ? '#2563eb' : '#0b1220';
      b.style.color = '#fff';
    });
  }
  async function setAlignment(axis, val) {
    if (axis === 'h') {
      pushLog(`align horizontal: text-align ${val}`);
      await writeValue('text-align', val);
    } else {
      pushLog(`align vertical: display flex + align-items ${val}`);
      if (await writeValue('display', 'flex'))
        await writeValue('align-items', val === 'top' ? 'flex-start' : val === 'bottom' ? 'flex-end' : 'center');
    }
    if (sel) renderPanel(true);
  }

  function closeEdit(input) {
    const row = input.closest('[data-prop]');
    row.textContent = rowValue(row.dataset.prop, row.dataset.fmt);
    row.classList.add('ke-val');
    row.tabIndex = 0;
  }

  function startEdit(valEl, prop) {
    if (valEl.querySelector('input')) return;
    valEl.classList.remove('ke-val');
    const fmt = valEl.dataset.fmt;
    const cur = rowValue(prop, fmt);
    valEl.innerHTML = `<input class="ke-input" value="${escapeHtml(cur)}"
      style="width:90px;background:#111c33;color:#e5e7eb;border:1px solid #2563eb;border-radius:4px;padding:1px 5px;font:11px ui-monospace, monospace;outline:none">`;
    const input = valEl.querySelector('input');
    input.focus();
    input.select();

    async function apply(raw, rel) {
      let value;
      if (rel) value = rel + 'px';
      else if (/^[+-]\d+(\.\d+)?$/.test(raw.trim())) {
        const base = parseFloat(cur);
        value = (isNaN(base) ? parseFloat(raw) : base + parseFloat(raw)) + 'px';
      } else if (/^-?\d+(\.\d+)?$/.test(raw.trim())) value = parseFloat(raw) + 'px';
      else value = raw.trim();
      await writeValue(prop, value);
    }

    input.onkeydown = async (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeEdit(input); return; }
      if (e.key === 'Enter') { e.preventDefault(); await apply(input.value); closeEdit(input); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const base = parseFloat(input.value);
        if (isNaN(base)) { pushLog(`tap skipped: ${prop} is "${input.value}", not a number. Type a value instead.`); return; }
        const step = e.shiftKey ? 10 : 1;
        const next = base + (e.key === 'ArrowUp' ? step : -step);
        input.value = next;
        await apply(String(next), next);
      }
    };
    input.onblur = () => closeEdit(input);
  }

  async function writeValue(prop, value) {
    const target = ruleForProp(sel, prop);
    if (!target) {
      note('No CSS rule matched; inline styles are not covered yet.', true);
      pushLog(`EDIT FAIL ${prop}: no stylesheet rule matches ${labelFor(sel)}`, true);
      return false;
    }
    const { rule, index, replaced } = target;
    const before = rule.style.getPropertyValue(prop);
    rule.style.setProperty(prop, value, rule.style.getPropertyPriority(prop) || undefined);
    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, selector: rule.selectorText, prop, value }),
      });
      const data = await res.json();
      const where = replaced ? `replaced in rule "${rule.selectorText}"` : `appended to rule "${rule.selectorText}"`;
      pushLog(`edit ${prop}: ${value} (${where}) → HTTP ${res.status} ${JSON.stringify(data)}`, !(res.ok && data.ok));
      if (!res.ok || !data.ok) {
        rule.style.setProperty(prop, before);
        note('Out of sync with css/style.css. Reload the page. (See log.)', true);
        return false;
      }
      editCount++;
      updEdits();
      note(`${prop}: ${data.written || value}`);
      pushLog(`settled ${prop} = ${getComputedStyle(sel).getPropertyValue(prop).trim()} on disk`);
      renderPanel(true);
      return true;
    } catch (err) {
      pushLog(`api edit failed: ${err}`, true);
      note('Server not reachable on /api/edit. Is npm run dev running?', true);
      return false;
    }
  }

  /* overlay toggle */
  $('ke-overlay').onclick = () => {
    overlayOn = !overlayOn;
    $('ke-overlay').style.background = overlayOn ? '#2563eb' : '#1f2937';
    $('ke-overlay').style.color = '#fff';
    pushLog(`overlay ${overlayOn ? 'on' : 'off'}`);
    if (overlayOn && sel) renderPanel(false);
    else panel.style.display = 'none';
  };

  /* panel tabs + filter (assigned once; the elements exist in the initial markup) */
  $('ke-tab-box').onclick = () => setView('box');
  $('ke-tab-all').onclick = () => setView('all');
  const filterEl = document.getElementById('ke-filter');
  filterEl.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); renderPanel(false); }
    e.stopPropagation(); /* keep Esc from deselecting while filtering */
  };
  filterEl.oninput = () => renderPanel(false);

  window.addEventListener('resize', positionPanel);
  window.addEventListener('scroll', positionPanel, true);

  window.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') { if (sel) pushLog('deselect'); deselect(); return; }
  });

  $('ke-commit').onclick = async () => {
    if (!editCount) { note('Nothing to commit yet.'); return; }
    note('Committing and pushing…');
    pushLog(`commit requested (${editCount} edits)`);
    try {
      const res = await fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Visual edits: ${editCount} change${editCount === 1 ? '' : 's'}` }),
      });
      const data = await res.json();
      pushLog(`api commit → ${JSON.stringify(data)}`, !data.ok);
      if (data.ok) { note(`Pushed. ${data.output || 'Vercel is deploying.'}`); editCount = 0; updEdits(); }
      else note(data.error || 'Commit failed. Check the terminal or the log.', true);
    } catch (err) {
      pushLog(`api commit failed: ${err}`, true);
      note('Server not reachable on /api/commit.', true);
    }
  };

  $('ke-revert').onclick = async () => {
    pushLog('revert requested');
    await fetch('/api/discard', { method: 'POST' });
    pushLog('file reverted, reloading');
    setTimeout(() => location.reload(), 400);
  };
})();

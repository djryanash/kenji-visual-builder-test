(function () {
  if (window.__kenjiVisualEditor) return;
  window.__kenjiVisualEditor = true;

  let sel = null;
  let editCount = 0;

  /* ---------------- activity log ---------------- */
  const LOG_KEY = 'kenji-editor-log';
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch {}
  const renderLog = () => {
    const box = $('ke-loglist');
    if (!box) return;
    box.innerHTML = logs
      .slice(-60)
      .map((l) => `<div style="color:${l.bad ? '#fca5a5' : '#9ecffa'}">${escapeHtml(l.t + '  ' + l.msg)}</div>`)
      .join('');
    box.scrollTop = box.scrollHeight;
  };
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function pushLog(msg, bad) {
    logs.push({ t: new Date().toLocaleTimeString(), msg, bad: !!bad });
    logs = logs.slice(-100);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch {}
    renderLog();
  }
  window.kenjiEditorLog = () => logs.map((l) => `${l.t} ${l.bad ? '[!]' : ''} ${l.msg}`).join('\n'); /* readable from the console */

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
      arrows nudge padding +4px &middot; Shift &minus;4px &middot; Alt margin &middot; &#8984;/Ctrl &plusmn;1px &middot; Esc deselect &middot; Alt-click follows links
    </div>`;
  document.documentElement.appendChild(hud);

  const $ = (id) => hud.querySelector('#' + id);
  const note = (msg, bad) => {
    $('ke-note').textContent = msg;
    $('ke-note').style.color = bad ? '#fca5a5' : '#a7f3d0';
  };
  const updEdits = () => { $('ke-edits').textContent = editCount ? `${editCount} edit${editCount === 1 ? '' : 's'}` : ''; };
  renderLog();

  $('ke-togglelog').onclick = () => {
    const box = $('ke-loglist');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  };
  $('ke-copylog').onclick = () => {
    const text = window.kenjiEditorLog();
    note('Log copied to clipboard.');
    try { navigator.clipboard.writeText(text); } catch {}
    if (window.parent === window) console.log(text);
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

  /* Flatten every style rule, depth-first, same order the server parses from the file.
     The editor's own injected stylesheet is skipped so its rules can never win the
     last-match scan (that matched .ke-selected first and made nudges snap back).  */
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
      if (s.ownerNode === styleEl || s.ownerNode === hud) return [];
      try { return flatten(s.cssRules); } catch { return []; }
    });
  }

  function select(el) {
    deselect();
    sel = el;
    el.classList.add('ke-selected');
    $('ke-target').textContent = labelFor(el);
    note('');
    pushLog(`select ${labelFor(el)}`);
  }
  function deselect() {
    if (sel) sel.classList.remove('ke-selected');
    sel = null;
    $('ke-target').textContent = 'Click an element to select it.';
  }

  styleEl = document.createElement('style');
  styleEl.textContent = '.ke-selected{outline:2px solid #2563eb !important;outline-offset:-2px;}';
  document.head.appendChild(styleEl);

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#kenji-editor')) return;
    if (e.altKey || e.metaKey || e.ctrlKey) return; /* pass clicks through to real links */
    e.preventDefault();
    e.stopPropagation();
    select(e.target);
  }, true);

  const camel = (prop) => prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  const computedValue = (prop) => parseFloat(getComputedStyle(sel)[camel(prop)]) || 0;

  async function nudgeProp(prop, delta) {
    if (!sel) return;
    const before = computedValue(prop);
    const rules = allRules();
    let idx = -1;
    let cssRule = null;
    for (let i = rules.length - 1; i >= 0; i--) {
      try { if (sel.matches(rules[i].selectorText)) { idx = i; cssRule = rules[i]; break; } } catch {}
    }
    if (idx === -1) {
      note('No CSS rule matched that element; inline styles are not covered yet.', true);
      pushLog(`NUDGE FAIL ${prop}: no stylesheet rule matches ${labelFor(sel)}`, true);
      return;
    }
    const value = Math.max(0, Math.round(before + delta)) + 'px';
    pushLog(`tap ${prop} ${delta > 0 ? '+' : ''}${delta}px on ${labelFor(sel)}`);

    cssRule.style.setProperty(prop, value, cssRule.style.getPropertyPriority(prop) || undefined);
    const beforeServerRule = cssRule.selectorText;

    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, selector: cssRule.selectorText, prop, value }),
      });
      const data = await res.json();
      pushLog(`api  edit #${idx} ${beforeServerRule} ${prop}:${value} → HTTP ${res.status} ${JSON.stringify(data)}`, !(res.ok && data.ok));

      if (!res.ok || !data.ok) {
        cssRule.style.setProperty(prop, before + 'px'); /* roll back the visual change */
        const expected = `${labelFor(sel)} reverts`;
        pushLog(`rollback: ${expected} → reload the page to re-sync with css/style.css`, true);
        note('Out of sync with css/style.css. Reload the page and try again. (See log for details.)', true);
        return;
      }

      editCount++;
      updEdits();
      note(`${prop}: ${value}`);
      /* settle check: catch anything that moves it back within the next moments.
         A newer tap in the same direction supersedes a previous check, that is progress
         not a revert; only a move against the delta direction gets flagged.  */
      setTimeout(() => {
        const now = computedValue(prop);
        const wentBack = (delta > 0 && now < parseInt(value)) || (delta < 0 && now > parseInt(value));
        if (sel && now !== parseInt(value) && wentBack) {
          pushLog(`REVERTED: ${prop} reads ${now}px after write, expected ${value}`, true);
          note(`${prop} jumped back to ${now}px — the log shows what wrote it back.`, true);
        } else {
          pushLog(`settled ${prop} = ${value}`);
        }
      }, 150);
    } catch (err) {
      pushLog(`api  edit failed: ${err}`, true);
      note('Server not reachable on /api/edit. Is npm run dev running?', true);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') { if (sel) pushLog('deselect'); deselect(); return; }
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
    pushLog(`commit requested (${editCount} edits)`);
    try {
      const res = await fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Visual nudges: ${editCount} change${editCount === 1 ? '' : 's'}` }),
      });
      const data = await res.json();
      pushLog(`api  commit → ${JSON.stringify(data)}`, !data.ok);
      if (data.ok) { note(`Pushed. ${data.output || 'Vercel is deploying.'}`); editCount = 0; updEdits(); }
      else note(data.error || 'Commit failed. Check the terminal or the log.', true);
    } catch (err) {
      pushLog(`api  commit failed: ${err}`, true);
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

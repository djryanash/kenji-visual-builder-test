#!/usr/bin/env node
/*
 * Kenji local visual editor server.
 * Serves the static site with an injected nudge editor, writes arrow-key
 * nudges back into css/style.css on disk, and commits/pushes on request.
 * Run: npm run dev  (then open http://localhost:5177)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
/* config.json sits beside server.js: { "cssFile": "css/style.css", "port": 5177 } */
const CFG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; }
})();
const PORT = process.env.PORT || CFG.port || 5177;
const CSS_FILE = path.join(ROOT, CFG.cssFile || 'css/style.css');
const LOG_FILE = path.join(__dirname, 'activities.log');
const BASELINE = path.join(__dirname, 'baseline.css'); /* pristine CSS restore point, managed by /api/reset-prop and /api/set-baseline */
const EDITOR_JS = () => fs.readFileSync(path.join(__dirname, 'editor.js'), 'utf8');

/* append-only activity log, tail it with: tail -f editor/activities.log */
function slog(line) {
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ` ${line}\n`); } catch {}
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

/* ---- CSS parsing: flatten leaf style rules in document order (mirrors the browser's depth-first cssRules walk) ---- */
function parseCssRules(text) {
  const rules = [];
  const stack = [];
  let headerStart = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      stack.push({ header: text.slice(headerStart, i).trim(), start: i + 1 });
    } else if (c === '}') {
      const block = stack.pop();
      if (block) {
        const header = block.header.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
        const isLeaf =
          header !== '' &&
          !header.startsWith('@') &&
          !/^(?:\d+(?:\.\d+)?%|from|to)/i.test(header); /* skip containers, @-rules, keyframe frames */
        if (isLeaf) rules.push({ selector: header.replace(/\s*,\s*/g, ', '), bodyStart: block.start, bodyEnd: i });
      }
      headerStart = i + 1;
    }
  }
  return rules;
}

/* ---- Write one property value back into css/style.css ---- */
function applyEdit({ index, selector, prop, value }) {
  const t0 = Date.now();
  if (!/^[a-z-]+$/i.test(prop)) {
    slog(`EDIT REJECT bad-prop "${prop}"`);
    return { ok: false, error: 'bad property' };
  }
  const text = fs.readFileSync(CSS_FILE, 'utf8');
  const rules = parseCssRules(text);
  const rule = rules[index];
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/\*::/g, '::'); /* Chrome serializes *::before as ::before */
  if (!rule || norm(rule.selector) !== norm(selector)) {
    slog(`EDIT RESYNC #${index} "${selector}" ${prop}:${value} (file has ${rules.length} rules${rule ? `, rule@#${index} is "${rule.selector}"` : ''})`);
    return { ok: false, resync: true };
  }
  const body = text.slice(rule.bodyStart, rule.bodyEnd);
  const re = new RegExp(`([^;\\n]*)[;\\n]\\s*${prop}\\s*:\\s*[^;}]*`);
  let newBody;
  if (re.test(body)) {
    newBody = body.replace(re, (m, leading) => `${leading};\n  ${prop}: ${value}`);
    /* collapse a possible leading ';' when the decl was first in the rule */
    newBody = newBody.replace(/^\s*;\s*(?=[^\s])/, '');
  } else {
    const stripped = body.replace(/\s+$/, '');
    newBody = stripped
      ? stripped + (stripped.endsWith(';') ? '' : ';') + `\n  ${prop}: ${value};` + body.slice(stripped.length)
      : `  ${prop}: ${value};`;
  }
  fs.writeFileSync(CSS_FILE, text.slice(0, rule.bodyStart) + newBody + text.slice(rule.bodyEnd));
  slog(`EDIT #${index} "${selector}" ${prop}: ${value} -> written in ${Date.now() - t0}ms`);
  return { ok: true };
}

/* ---- resolve a rule by its full selector text, independent of file position ---- */
function findRuleByText(rules, selector) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ', ').replace(/\*::/g, '::');
  for (let i = rules.length - 1; i >= 0; i--) if (norm(rules[i].selector) === norm(selector)) return rules[i];
  return null;
}

/* ---- baseline: restore one property to its value from the pristine copy ---- */
function baselineValueFor(selector, prop) {
  try {
    const rules = parseCssRules(fs.readFileSync(BASELINE, 'utf8'));
    const rule = findRuleByText(rules, selector);
    if (!rule) return { found: false };
    const body = fs.readFileSync(BASELINE, 'utf8').slice(rule.bodyStart, rule.bodyEnd);
    const m = body.match(new RegExp(`(?:^|[;\\n])\\s*${prop}\\s*:\\s*([^;}]+)`));
    return { found: true, value: m ? m[1].trim() : null };
  } catch { return { found: false, missing: true }; }
}

function removeDecl(selector, prop) {
  const text = fs.readFileSync(CSS_FILE, 'utf8');
  const rule = findRuleByText(parseCssRules(text), selector);
  if (!rule) return { ok: false, error: `rule "${selector}" not found in current css/style.css` };
  const body = text.slice(rule.bodyStart, rule.bodyEnd);
  const newBody = body.replace(new RegExp(`\\n?[ \\t]*${prop}\\s*:[^;}]*;?`), '');
  if (newBody === body) return { ok: false, error: `${prop} is not in rule "${selector}"` };
  fs.writeFileSync(CSS_FILE, text.slice(0, rule.bodyStart) + newBody + text.slice(rule.bodyEnd));
  return { ok: true, removed: true };
}

/* ---- Git helpers ---- */
function gitClean() {
  return spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() === '';
}
function gitCommit(message) {
  const add = spawnSync('git', ['add', '-A'], { cwd: ROOT, encoding: 'utf8' });
  if (add.status !== 0) return { ok: false, error: add.stderr };
  const commit = spawnSync('git', ['commit', '-m', message], { cwd: ROOT, encoding: 'utf8' });
  if (commit.status !== 0) return { ok: false, error: commit.stderr || commit.stdout };
  const push = spawnSync('git', ['push'], { cwd: ROOT, encoding: 'utf8' });
  if (push.status !== 0) return { ok: false, error: push.stderr || push.stdout };
  return { ok: true, output: push.stdout.split('\n').filter(Boolean).pop() || '' };
}

/* ---- Static serving with editor injection ---- */
function serveFile(req, res, file) {
  let data = fs.readFileSync(file);
  const ext = path.extname(file);
  const type = MIME[ext] || 'application/octet-stream';
  if (ext === '.html') {
    const inject = `<script src="/__editor.js" defer></script>`;
    const html = /<\/body>/i.test(data.toString('utf8'))
      ? data.toString('utf8').replace(/<\/body>/i, `${inject}</body>`)
      : data.toString('utf8').replace(/<\/html>/i, `${inject}</html>`);
    data = Buffer.from(html);
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/__editor.js') return serveFile(req, res, path.join(__dirname, 'editor.js'));

    if (req.method === 'POST' && url.pathname === '/api/edit') {
      const body = await readBody(req);
      slog(`/api/edit <- ${JSON.stringify(body)}`);
      const result = applyEdit(body);
      slog(`/api/edit -> ${JSON.stringify(result)}`);
      return res.end(JSON.stringify(result));
    }

    if (req.method === 'POST' && url.pathname === '/api/commit') {
      const { message } = await readBody(req);
      slog(`/api/commit "${message || ''}" clean=${gitClean()}`);
      if (gitClean()) {
        slog('/api/commit -> nothing to commit');
        return res.end(JSON.stringify({ ok: true, status: 'clean', output: 'nothing to commit' }));
      }
      const msg = (message && String(message).slice(0, 80)) || 'Visual nudges from the local editor';
      const result = gitCommit(msg);
      slog(`/api/commit -> ${JSON.stringify(result)}`);
      return res.end(JSON.stringify(result));
    }

    if (req.method === 'POST' && url.pathname === '/api/reset-prop') {
      const { selector, prop } = await readBody(req);
      const base = baselineValueFor(selector, prop);
      if (base.missing) {
        slog(`/api/reset-prop <- no baseline yet (selector "${selector}", ${prop})`);
        return res.end(JSON.stringify({ ok: false, error: 'no baseline yet: use the baseline button once the file looks right' }));
      }
      if (!base.found) {
        slog(`/api/reset-prop <- rule "${selector}" not in baseline`);
        return res.end(JSON.stringify({ ok: false, error: `rule "${selector}" is not in the baseline` }));
      }
      let result;
      if (base.value) {
        const rules = parseCssRules(fs.readFileSync(CSS_FILE, 'utf8'));
        const rule = findRuleByText(rules, selector);
        const idx = rules.indexOf(rule);
        result = rule ? applyEdit({ index: idx, selector, prop, value: base.value })
                      : { ok: false, error: `rule "${selector}" not in current css/style.css` };
      } else {
        result = removeDecl(selector, prop);
      }
      slog(`/api/reset-prop "${selector}" ${prop} -> ${JSON.stringify(result)}`);
      return res.end(JSON.stringify(base.value ? { ...result, value: base.value } : result));
    }

    if (req.method === 'POST' && url.pathname === '/api/set-baseline') {
      fs.copyFileSync(CSS_FILE, BASELINE);
      slog('/api/set-baseline -> baseline updated from current css/style.css');
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'POST' && url.pathname === '/api/discard') {
      spawnSync('git', ['checkout', '--', '.'], { cwd: ROOT });
      slog('/api/discard -> reverted');
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'GET' && url.pathname === '/api/log') {
      try {
        return res.end(fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-200).join('\n'));
      } catch { return res.end('(no log activity yet)'); }
    }

    if (url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end(); }

    /* static files */
    let file = path.join(ROOT, decodeURIComponent(url.pathname)); 
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (file.includes('/.git/')) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    return serveFile(req, res, file);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(err));
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () =>
    console.log(`Kenji editor → http://localhost:${PORT} (baseline: ${fs.existsSync(BASELINE) ? 'present' : 'none yet'})`)
  );
}

module.exports = { parseCssRules, applyEdit };

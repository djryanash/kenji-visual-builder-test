# Kenji Visual Builder Test

A basic framework in vanilla HTML and CSS, created as the starting point for testing [Webstudio](https://apps.webstudio.is), a visual webpage builder that integrates with GitHub. Every push to `main` deploys automatically to Vercel.

## Structure

```
.
├── index.html        # Home page: header, hero, feature grid, footer
├── about.html        # About page
├── css/
│   └── style.css     # Design tokens (CSS variables), reset, components
└── README.md
```

## Editing

No build step. Open the HTML files and edit them directly, or let a visual builder write to this repo (Plasmic syncs here through its GitHub workflow, the local editor nudges CSS values directly). Deploy happens on push.

### Local visual editor

`npm run dev` starts a local server on port 5177 that serves the site with a visual dimension editor. Click any element to select it, then toggle `overlay` to open the floating panel, which has two views. `box` shows all of its dimensions (width, height, font, margins, paddings) plus alignment buttons: horizontal sets `text-align` (left, center, right), vertical sets `display: flex` with `align-items` (top, center, bottom) to position the text inside the element, and the active choice is highlighted from computed styles. `all` lists every editable CSS property, grouped and searchable: layout, flexbox, grid, spacing, typography, and backgrounds, each showing its computed value. Clicking a value in either view lets you type a replacement (numbers are px, plain units like `2rem` or color names like `tomato` pass through, `+4`/`-4` is relative to the current value) or tap the up/down arrows on it to step by 1px (Shift for 10); non-numeric values are skipped by the arrows with a log note. Every change writes the real value into `css/style.css` on disk. The `overlay` and `commit` controls sit above every page layer and the panel always stays clear of them. The Commit button runs git add, commit, and push, which triggers the Vercel deploy. Revert discards every change since the last commit. Only the local machine can reach the server; the files on GitHub are unchanged until a commit is pushed.

### Using it on another site (manual, no npm)

`./editor/install.sh <path-to-site>` detects what the site is built on (vanilla/static, WordPress, Next.js, and so on), locates its main stylesheet, and copies the editor into the site's own `kenji-editor/` folder with a config file. Vanilla and static sites run right away with `node kenji-editor/server.js` (the server resolves the project root from its own folder, and `config.json` picks the stylesheet and port). Server-rendered and bundler-based frameworks are detected and refused for now: they need the planned override-stylesheet mode where edits land in a dedicated last-loaded stylesheet instead of the original file. Nothing the installer adds reaches production: the editor is injected only by the local server.

### Show/hide and page-CSS immunity

The K pill in the bottom-left corner toggles the editor, as does Cmd/Ctrl+Shift+E, and the hidden state persists across reloads (`?kenji=1` on the URL forces it visible). The editor's own UI carries a baked-in style block (position, margins, background, font, box-sizing, all `!important` on its IDs), so page CSS, including universal rules like `* { margin: ... }` that a margin write may legitimately extend, cannot move or restyle it.

The editor keeps an activity log. In the HUD, `log` toggles the live panel and `copy` copies it; in the browser console, `kenjiEditorLog()` prints it. The server appends its side of every request to `editor/activities.log`, which you can tail with `!tail -f editor/activities.log`, and `http://localhost:5177/api/log` returns the last 200 lines.

Every value row has a ⟲ button that restores that property from the baseline: its value as of the pristine copy in `editor/baseline.css`, or removes the declaration if the baseline never set it. The `Set baseline` button in the HUD saves the current file as that restore point, so after reaching a state worth keeping, mark it and future experiments can always be walked back one property at a time. (Revert still discards everything to the last commit, and the baseline file is local-only, never pushed.)

## Deploy

Static site, zero configuration on Vercel: the framework detects plain HTML and serves the files as-is. Vercel previews are generated for pull requests, and production deploys follow `main`.

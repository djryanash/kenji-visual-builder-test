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

`npm run dev` starts a local server on port 5177 that serves the site with a visual dimension editor. Click any element to select it, then toggle `overlay` to see all of its dimensions (width, height, font, margins, paddings) in a floating list, plus alignment buttons: horizontal sets `text-align` (left, center, right), vertical sets `display: flex` with `align-items` (top, center, bottom) to position the text inside the element, and the active choice is highlighted from computed styles. Clicking a dimension value lets you type a replacement (numbers are px, plain units like `2rem` pass through, `+4`/`-4` is relative) or tap the up/down arrows on it to step by 1px (Shift for 10). Every change writes the real value into `css/style.css` on disk. The `overlay` and `commit` controls sit above every page layer and the panel always stays clear of them. The Commit button runs git add, commit, and push, which triggers the Vercel deploy. Revert discards every change since the last commit. Only the local machine can reach the server; the files on GitHub are unchanged until a commit is pushed.

The editor keeps an activity log. In the HUD, `log` toggles the live panel and `copy` copies it; in the browser console, `kenjiEditorLog()` prints it. The server appends its side of every request to `editor/activities.log`, which you can tail with `!tail -f editor/activities.log`, and `http://localhost:5177/api/log` returns the last 200 lines.

## Deploy

Static site, zero configuration on Vercel: the framework detects plain HTML and serves the files as-is. Vercel previews are generated for pull requests, and production deploys follow `main`.

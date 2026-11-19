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

`npm run dev` starts a local server on port 5177 that serves the site with a select-and-nudge editor: click any element, then arrow keys change its real `padding` values (Shift for margin, with step size 4px or 1px with Cmd/Ctrl) in `css/style.css` on disk. The Commit button runs git add, commit, and push, which triggers the Vercel deploy. Revert discards every change since the last commit. Only the local machine can reach the server; the files on GitHub are unchanged until a commit is pushed.

The editor keeps an activity log. In the HUD, `log` toggles the live panel and `copy` copies it; in the browser console, `kenjiEditorLog()` prints it. The server appends its side of every request to `editor/activities.log`, which you can tail with `!tail -f editor/activities.log`, and `http://localhost:5177/api/log` returns the last 200 lines.

## Deploy

Static site, zero configuration on Vercel: the framework detects plain HTML and serves the files as-is. Vercel previews are generated for pull requests, and production deploys follow `main`.

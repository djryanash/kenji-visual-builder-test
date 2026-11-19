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

No build step. Open the HTML files and edit them directly, or let Webstudio write to this repo. Deploy happens on push.

## Deploy

Static site, zero configuration on Vercel: the framework detects plain HTML and serves the files as-is. Vercel previews are generated for pull requests, and production deploys follow `main`.

# Kwality House Studio Intelligence

A browser-based briefing and presenter workspace for the nine September 2026 Kwality House reports.

## Open / run

The app is served at the live preview for this workspace. To run locally, serve this folder over HTTP (the report reader uses same-origin `fetch` and iframes):

```bash
python -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173/`.

## Included

- Nine original report views, plus a searchable section outline and global report search.
- Reader controls: focus/fullscreen mode, reading-size controls, progress, bookmarks and estimated reading time.
- Persistent per-report annotations with highlight colours, Insight / Action / Question / Risk categories, priority, tags, search/filter, edit and jump-to-highlight; sticky notes and speaker notes save in browser storage.
- Whole-report exports: print-ready PDF workflow (choose “Save as PDF”), standalone HTML, Markdown, plain text and structured JSON; separate export for presenter notes and annotations.
- Presenter console in a separate window, with section navigation, speaker notes, timer, follow-presenter sync and a live teleprompter.
- Source-grounded local insight assistant that retrieves evidence from the report library in-browser.
- A floating dashboard sound icon opens quick cues and volume; sound cues are synthesized with Web Audio, with no audio assets or external APIs.
- Keyboard shortcuts: `⌘/Ctrl + K` search, `F` focus mode, `N` speaker notes, `P` presenter view, `T` teleprompter, `Alt + ←/→` previous/next report, `Esc` close.

The report files are bundled in `reports/`. The saved copies omit injected third-party analytics/challenge scripts; visible report content and charts are retained. Notes, annotations and scripts stay in this browser unless explicitly exported.

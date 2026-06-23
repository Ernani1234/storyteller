# Storyteller

Type any work — a game, film, anime, series, book or comic — and Storyteller
reconstructs its **whole story** as an interactive, clickable tree of chapters.
Click any node to read that part of the tale, with relevant images.

Powered by your own OpenAI API key; built as a cross-platform desktop app
(Electron + React + reactflow).

## How it works

1. On first launch you paste an **OpenAI API key** (stored locally, encrypted).
2. Search a title → Storyteller asks the model for a **chapter outline** (the
   tree skeleton).
3. Click a node → it fetches that chapter's full narrative + key beats **on
   demand** ("part by part"), and pulls illustrative images from Wikimedia
   Commons.

## Develop

```bash
npm install
npm run dev
```

## Build a Windows installer (.exe)

```bash
npm run dist
```

Output lands in `release/`. The app icon is generated from
[`build/icon.svg`](build/icon.svg) into `build/icon.ico` by `npm run icon`
(run automatically by `dist`).

## Settings

- **Theme** — six pastel palettes (incl. a dark "Dusk").
- **Model** — choose any chat model your key can access.
- **Story language** — match your input or force a language.

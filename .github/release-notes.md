Read the whole story of any game, film, anime, series, book or comic as a map of chapters, built from open sources (Wikipedia, Fandom, TVMaze, AniList). AI is optional: plug in an OpenAI key or a local model (Ollama, LM Studio) when you want it.

## What's new in 2.0.4

- **Chapter pictures that belong to the story.** A chapter's pictures now come only from the work's own world: pages its Wikipedia article links to (characters, places, factions), pages titled with the work or its franchise ("Ellie (The Last of Us)"), and fan-wiki screenshots. Previously a word like "Empire" could bring in the Roman Empire.
  - Translated stories look names up as the source wrote them.
  - Names must match whole: "Tom" no longer finds an actor called Tom.
  - Other works of a franchise (a film, a novel, a rulebook) are no longer used as pictures of a chapter.
- **When nothing matches**, a chapter shows one of the work's own pictures instead: a game screenshot, a film scene, a filming location, a different one per chapter. A chapter may now have fewer pictures, but they fit.

## What's new in 2.0.3

- **Stories translated into your language, no AI needed.** When the fullest telling of a story is in another language (often the English Wikipedia or a fan wiki), Storyteller now machine-translates it with Google Translate: chapter titles, text, key moments and episode summaries. A banner says the text was translated and may contain mistakes, and **Show original** switches back to the source text at any time, from the banner or the chapter panel. Questions, search and export work on the translated text, and the translation is saved with the story so it reopens offline. You can turn this off in **Settings → Story engine → Translate stories automatically**.
- **Series with English-only episodes are labeled correctly.** Shows like Arcane were marked as being in your language because of a local premise, even though every episode summary was in English. Those episodes are now translated too, and the parts already in your language are left as written.

Stories already in your library aren't translated automatically. Search for one and choose **Build again** to translate it.

## What's new in 2.0.2

- **The story map reads top to bottom.** Stories without branches are now one vertical column you scroll through, instead of a zig-zag where the first and last chapters could end up next to each other. The mouse wheel scrolls the map; Ctrl + wheel zooms. If you liked the compact grid, use the new button in the map's zoom controls or **Settings → Appearance → Story map**.
- **Better chapters for short plots.** Chapter length now follows the length of the story, so short plots with headings are no longer cut into two or three long chapters. For example, Fallout 4 now has 5 chapters instead of 3.
- **Spoiler shield on by default** for new installs. Summaries of chapters you haven't read are blurred on the map until you hover over them. Existing installs keep their current setting.

## What's new in 2.0.1

- **Fuller stories without AI.** Storyteller now picks the most complete telling of a story (often a fan wiki or the English Wikipedia) instead of the first short summary it finds. Series get a 100–200-word synopsis per episode from Wikipedia season articles and "List of episodes" pages, where TVMaze has only a line or two. To keep stories in your own language even when that version is shorter, change **Settings → Story engine → Story detail**.
- **English by default, seven interface languages.** New installs start in English. Switch to Português (Brasil), Español, Français, Deutsch, Italiano or 日本語 on the welcome screen or in **Settings → Appearance**. Stories follow the interface language unless you pick another one.
- **Fixes**
  - Searches go to the main work instead of a spin-off with a similar name.
  - Picture captions and tables of contents from fan wikis no longer end up in the story text.
  - Wikipedia rate limits are retried automatically.
  - Japanese chapter titles read naturally (第1部, シーズン1 · 第1–13話).

If you used 2.0.0 with the interface on "System default", 2.0.1 opens in English. Pick your language again in Settings.

## Download

| Platform | File |
|---|---|
| **Windows** 10/11 (64-bit) | `Storyteller-…-windows-setup.exe` |
| **macOS** Apple Silicon (M1–M4) | `Storyteller-…-mac-arm64.dmg` |
| **macOS** Intel | `Storyteller-…-mac-x64.dmg` |
| **Linux** (any distro) | `Storyteller-…-linux-x86_64.AppImage` |
| **Linux** Debian / Ubuntu | `Storyteller-…-linux-amd64.deb` |
| **Android** 7.0+ | `Storyteller-…-android.apk` |

## First launch

The builds aren't signed with paid certificates yet, so each system asks once:

- **Windows**: SmartScreen says "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS**: open the `.dmg`, drag Storyteller to Applications, then **right-click the app → Open → Open**. If macOS still refuses, run `xattr -cr /Applications/Storyteller.app` in Terminal.
- **Linux (AppImage)**: `chmod +x Storyteller-*.AppImage` and run it. **Debian/Ubuntu**: `sudo apt install ./Storyteller-*.deb`.
- **Android**: open the `.apk` and allow installing from your browser or file manager when asked.

Your stories, reading progress and settings stay on your device.

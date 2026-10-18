Read the whole story of any game, film, anime, series, book or comic as a map of chapters, built from open sources (Wikipedia, Fandom, TVMaze, AniList). AI is optional: plug in an OpenAI key or a local model (Ollama, LM Studio) when you want it.

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

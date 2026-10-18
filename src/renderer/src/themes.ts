import type { ReadingFont } from '../../shared/types'

export interface Theme {
  id: string
  name: string
  dark?: boolean
  vars: Record<string, string>
}

/**
 * Each theme is a soft pastel palette mapped onto the CSS custom properties in
 * index.css. `--accent` is for fills; `--accent-ink` is the same hue dark
 * enough (≥4.5:1) to be used for text on `--bg`/`--bg-elev`.
 */
const LIGHT_SEMANTIC = {
  '--danger': '#C2415D',
  '--danger-soft': '#FBE3E8',
  '--success': '#2E8A63',
  '--success-soft': '#DDF3E8',
  '--warn': '#A86A12',
  '--warn-soft': '#FBEFD9',
  '--scrim': 'rgba(40, 32, 60, 0.36)'
}
const DARK_SEMANTIC = {
  '--danger': '#F29AAE',
  '--danger-soft': '#4A2632',
  '--success': '#8BD9B6',
  '--success-soft': '#1F3B30',
  '--warn': '#F0C27A',
  '--warn-soft': '#433420',
  '--scrim': 'rgba(0, 0, 0, 0.55)'
}

export const themes: Theme[] = [
  {
    id: 'lavender',
    name: 'Lavender',
    vars: {
      '--bg': '#FBF7FF',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFF2',
      '--text': '#3B3450',
      '--text-soft': '#716985',
      '--border': '#ECE3FA',
      '--accent': '#A78BDA',
      '--accent-ink': '#6B4FB5',
      '--accent-soft': '#EFE7FC',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#F3ECFF',
      '--edge': '#CDBDF0',
      '--mark': '#E6DAFB',
      '--shadow': 'rgba(120, 92, 180, 0.16)',
      ...LIGHT_SEMANTIC
    }
  },
  {
    id: 'mint',
    name: 'Mint',
    vars: {
      '--bg': '#F4FBF7',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFF2',
      '--text': '#2F4A3F',
      '--text-soft': '#5A7568',
      '--border': '#DCF1E6',
      '--accent': '#6FC8A0',
      '--accent-ink': '#277553',
      '--accent-soft': '#E2F5EC',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#E7F7EF',
      '--edge': '#A9E0C6',
      '--mark': '#CDEFDD',
      '--shadow': 'rgba(60, 140, 105, 0.16)',
      ...LIGHT_SEMANTIC
    }
  },
  {
    id: 'peach',
    name: 'Peach',
    vars: {
      '--bg': '#FFF8F4',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFF2',
      '--text': '#5A3F37',
      '--text-soft': '#85675B',
      '--border': '#FBE6DA',
      '--accent': '#F0A47C',
      '--accent-ink': '#B5582B',
      '--accent-soft': '#FDEBE1',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#FDEEE5',
      '--edge': '#F4C3A6',
      '--mark': '#FAD9C6',
      '--shadow': 'rgba(200, 120, 80, 0.16)',
      ...LIGHT_SEMANTIC
    }
  },
  {
    id: 'sky',
    name: 'Sky',
    vars: {
      '--bg': '#F4F9FF',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFF2',
      '--text': '#33455A',
      '--text-soft': '#5B6E84',
      '--border': '#DEEDFB',
      '--accent': '#79B8E8',
      '--accent-ink': '#2F6FA3',
      '--accent-soft': '#E4F1FC',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#E6F2FD',
      '--edge': '#A9D2F0',
      '--mark': '#CFE6F9',
      '--shadow': 'rgba(70, 130, 190, 0.16)',
      ...LIGHT_SEMANTIC
    }
  },
  {
    id: 'rose',
    name: 'Rose',
    vars: {
      '--bg': '#FFF6F9',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFF2',
      '--text': '#553944',
      '--text-soft': '#82606C',
      '--border': '#FBE0EA',
      '--accent': '#E891AC',
      '--accent-ink': '#B0476A',
      '--accent-soft': '#FCE7EF',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#FDEAF1',
      '--edge': '#F2B6CB',
      '--mark': '#F8D3E0',
      '--shadow': 'rgba(190, 90, 125, 0.16)',
      ...LIGHT_SEMANTIC
    }
  },
  {
    id: 'dusk',
    name: 'Dusk',
    dark: true,
    vars: {
      '--bg': '#211E2B',
      '--bg-elev': '#2A2636',
      '--panel': '#2A2636F5',
      '--text': '#EDE7FA',
      '--text-soft': '#B3AACA',
      '--border': '#3A3450',
      '--accent': '#B9A3EC',
      '--accent-ink': '#CDBBF5',
      '--accent-soft': '#3A3257',
      '--accent-contrast': '#211E2B',
      '--node': '#2F2A3E',
      '--node-active': '#3A3257',
      '--edge': '#5A4F7E',
      '--mark': '#54467F',
      '--shadow': 'rgba(0, 0, 0, 0.45)',
      ...DARK_SEMANTIC
    }
  },
  {
    id: 'night',
    name: 'Night',
    dark: true,
    vars: {
      '--bg': '#161A23',
      '--bg-elev': '#1E2330',
      '--panel': '#1E2330F5',
      '--text': '#E6EAF2',
      '--text-soft': '#A3ADC2',
      '--border': '#2B3243',
      '--accent': '#8AB4F8',
      '--accent-ink': '#A9C8FB',
      '--accent-soft': '#24324D',
      '--accent-contrast': '#10141C',
      '--node': '#1F2533',
      '--node-active': '#26324A',
      '--edge': '#3C4A66',
      '--mark': '#2F4A78',
      '--shadow': 'rgba(0, 0, 0, 0.5)',
      ...DARK_SEMANTIC
    }
  }
]

export const SYSTEM_THEME = 'system'

function resolveTheme(id: string): Theme {
  if (id === SYSTEM_THEME) {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return themes.find((t) => t.id === (dark ? 'dusk' : 'lavender'))!
  }
  return themes.find((t) => t.id === id) ?? themes[0]
}

const READING_FONTS: Record<ReadingFont, string> = {
  sans: "var(--font-ui)",
  serif: "'Sitka Text', 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif"
}

export function applyAppearance(a: { theme: string; readingFont?: ReadingFont; textScale?: number }): void {
  const theme = resolveTheme(a.theme)
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v)
  root.style.setProperty('--font-read', READING_FONTS[a.readingFont ?? 'sans'])
  root.style.setProperty('--scale', String(a.textScale ?? 1))
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  root.dataset.theme = theme.id
}

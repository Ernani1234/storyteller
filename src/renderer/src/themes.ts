export interface Theme {
  id: string
  name: string
  vars: Record<string, string>
}

/**
 * Each theme is a soft pastel palette. Variables map onto the CSS custom
 * properties consumed in index.css.
 */
export const themes: Theme[] = [
  {
    id: 'lavender',
    name: 'Lavender',
    vars: {
      '--bg': '#FBF7FF',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFEE',
      '--text': '#3B3450',
      '--text-soft': '#7C748F',
      '--border': '#ECE3FA',
      '--accent': '#A78BDA',
      '--accent-soft': '#EBE2FB',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#F3ECFF',
      '--edge': '#CDBDF0',
      '--shadow': 'rgba(167,139,218,0.22)'
    }
  },
  {
    id: 'mint',
    name: 'Mint',
    vars: {
      '--bg': '#F4FBF7',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFEE',
      '--text': '#2F4A3F',
      '--text-soft': '#6E8B7E',
      '--border': '#DCF1E6',
      '--accent': '#6FC8A0',
      '--accent-soft': '#DFF4EB',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#E7F7EF',
      '--edge': '#A9E0C6',
      '--shadow': 'rgba(111,200,160,0.22)'
    }
  },
  {
    id: 'peach',
    name: 'Peach',
    vars: {
      '--bg': '#FFF8F4',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFEE',
      '--text': '#5A3F37',
      '--text-soft': '#9A7C70',
      '--border': '#FBE6DA',
      '--accent': '#F0A47C',
      '--accent-soft': '#FCE7DB',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#FDEEE5',
      '--edge': '#F4C3A6',
      '--shadow': 'rgba(240,164,124,0.22)'
    }
  },
  {
    id: 'sky',
    name: 'Sky',
    vars: {
      '--bg': '#F4F9FF',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFEE',
      '--text': '#33455A',
      '--text-soft': '#6F839A',
      '--border': '#DEEDFB',
      '--accent': '#79B8E8',
      '--accent-soft': '#E2F0FC',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#E6F2FD',
      '--edge': '#A9D2F0',
      '--shadow': 'rgba(121,184,232,0.22)'
    }
  },
  {
    id: 'rose',
    name: 'Rose',
    vars: {
      '--bg': '#FFF6F9',
      '--bg-elev': '#FFFFFF',
      '--panel': '#FFFFFFEE',
      '--text': '#553944',
      '--text-soft': '#977380',
      '--border': '#FBE0EA',
      '--accent': '#E891AC',
      '--accent-soft': '#FCE4ED',
      '--accent-contrast': '#FFFFFF',
      '--node': '#FFFFFF',
      '--node-active': '#FDEAF1',
      '--edge': '#F2B6CB',
      '--shadow': 'rgba(232,145,172,0.22)'
    }
  },
  {
    id: 'dusk',
    name: 'Dusk (dark)',
    vars: {
      '--bg': '#211E2B',
      '--bg-elev': '#2A2636',
      '--panel': '#2A2636F2',
      '--text': '#EDE7FA',
      '--text-soft': '#A89FC0',
      '--border': '#3A3450',
      '--accent': '#B9A3EC',
      '--accent-soft': '#3A3257',
      '--accent-contrast': '#211E2B',
      '--node': '#2F2A3E',
      '--node-active': '#3A3257',
      '--edge': '#5A4F7E',
      '--shadow': 'rgba(0,0,0,0.45)'
    }
  }
]

export function applyTheme(id: string): void {
  const theme = themes.find((t) => t.id === id) ?? themes[0]
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v)
  }
  root.dataset.theme = theme.id
}

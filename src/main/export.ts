import { app, BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileName, parseImported, toHtml, toJson, toMarkdown } from '../core/exporting'
import type { ExportFormat, ExportLabels, SavedStory } from '../shared/types'

/** Desktop export: native save dialog; PDF is the HTML export printed by Chromium. */
export async function exportStory(
  win: BrowserWindow | null,
  story: SavedStory,
  format: ExportFormat,
  labels: ExportLabels
): Promise<string | null> {
  const filters = {
    md: [{ name: 'Markdown', extensions: ['md'] }],
    pdf: [{ name: 'PDF', extensions: ['pdf'] }],
    json: [{ name: 'Storyteller', extensions: ['json'] }]
  }[format]
  const defaultPath = join(app.getPath('documents'), `${fileName(story.outline.title)}.${format}`)
  const res = win
    ? await dialog.showSaveDialog(win, { defaultPath, filters })
    : await dialog.showSaveDialog({ defaultPath, filters })
  if (res.canceled || !res.filePath) return null
  const filePath = res.filePath

  if (format === 'md') {
    await fs.writeFile(filePath, toMarkdown(story, labels), 'utf8')
  } else if (format === 'json') {
    await fs.writeFile(filePath, toJson(story), 'utf8')
  } else {
    const tmp = join(tmpdir(), `storyteller-${Date.now()}.html`)
    await fs.writeFile(tmp, toHtml(story, labels), 'utf8')
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await pdfWin.loadFile(tmp) // resolves after window load, i.e. once images are in
      const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      await fs.writeFile(filePath, pdf)
    } finally {
      pdfWin.destroy()
      fs.rm(tmp, { force: true }).catch(() => undefined)
    }
  }
  return filePath
}

export async function importStory(win: BrowserWindow | null): Promise<SavedStory | null> {
  const opts = { filters: [{ name: 'Storyteller', extensions: ['json'] }], properties: ['openFile' as const] }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths[0]) return null
  return parseImported(await fs.readFile(res.filePaths[0], 'utf8'))
}

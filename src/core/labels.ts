/**
 * Structural labels written *into* stories (titles of generated nodes).
 * Numbered labels are templates, since word order differs ("Season 2", "第2部").
 */
const LABELS = {
  en: { part: 'Part {n}', season: 'Season {n}', premise: 'Premise', overview: 'Overview', episodeCount: '{n} episodes', episodeRange: 'Episodes {n}', prologue: 'Beginning' },
  pt: { part: 'Parte {n}', season: 'Temporada {n}', premise: 'Premissa', overview: 'Visão geral', episodeCount: '{n} episódios', episodeRange: 'Episódios {n}', prologue: 'Início' },
  es: { part: 'Parte {n}', season: 'Temporada {n}', premise: 'Premisa', overview: 'Resumen', episodeCount: '{n} episodios', episodeRange: 'Episodios {n}', prologue: 'Inicio' },
  fr: { part: 'Partie {n}', season: 'Saison {n}', premise: 'Prémisse', overview: 'Aperçu', episodeCount: '{n} épisodes', episodeRange: 'Épisodes {n}', prologue: 'Début' },
  ja: { part: '第{n}部', season: 'シーズン{n}', premise: '前提', overview: '概要', episodeCount: '全{n}話', episodeRange: '第{n}話', prologue: '序章' },
  de: { part: 'Teil {n}', season: 'Staffel {n}', premise: 'Prämisse', overview: 'Überblick', episodeCount: '{n} Folgen', episodeRange: 'Folgen {n}', prologue: 'Anfang' },
  it: { part: 'Parte {n}', season: 'Stagione {n}', premise: 'Premessa', overview: 'Panoramica', episodeCount: '{n} episodi', episodeRange: 'Episodi {n}', prologue: 'Inizio' }
}

export type Labels = (typeof LABELS)['en']

export function labelsFor(lang: string): Labels {
  return (LABELS as Record<string, Labels>)[lang] ?? LABELS.en
}

/** Put a number (or range) into a label template: fill(L.season, 2) → "Season 2". */
export function fill(template: string, n: number | string): string {
  return template.replace('{n}', String(n))
}

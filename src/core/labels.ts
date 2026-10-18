/** Structural labels written *into* stories (titles of generated nodes). */
const LABELS = {
  en: { part: 'Part', season: 'Season', premise: 'Premise', overview: 'Overview', episodes: 'episodes', episodesCap: 'Episodes', prologue: 'Beginning' },
  pt: { part: 'Parte', season: 'Temporada', premise: 'Premissa', overview: 'Visão geral', episodes: 'episódios', episodesCap: 'Episódios', prologue: 'Início' },
  es: { part: 'Parte', season: 'Temporada', premise: 'Premisa', overview: 'Resumen', episodes: 'episodios', episodesCap: 'Episodios', prologue: 'Inicio' },
  fr: { part: 'Partie', season: 'Saison', premise: 'Prémisse', overview: 'Aperçu', episodes: 'épisodes', episodesCap: 'Épisodes', prologue: 'Début' },
  ja: { part: '第', season: 'シーズン', premise: '前提', overview: '概要', episodes: '話', episodesCap: '話', prologue: '序章' },
  de: { part: 'Teil', season: 'Staffel', premise: 'Prämisse', overview: 'Überblick', episodes: 'Folgen', episodesCap: 'Folgen', prologue: 'Anfang' },
  it: { part: 'Parte', season: 'Stagione', premise: 'Premessa', overview: 'Panoramica', episodes: 'episodi', episodesCap: 'Episodi', prologue: 'Inizio' }
}

export type Labels = (typeof LABELS)['en']

export function labelsFor(lang: string): Labels {
  return (LABELS as Record<string, Labels>)[lang] ?? LABELS.en
}

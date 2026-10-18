/**
 * Heuristics for spotting the plot section of an article in any of the
 * languages we scrape, and for cleaning up the text inside it.
 */

const RULES: [RegExp, number][] = [
  [/^(plot|plot summary|plot overview|synopsis|story|storyline|summary|narrative|story summary)$/i, 10],
  [/^(enredo|sinopse|trama|resumo|argumento|narrativa|enredo e personagens)$/i, 10],
  [/^(sinopsis|argumento|trama|resumen|argumento y trama)$/i, 10],
  [/^(synopsis|résumé|intrigue|scénario|trame|histoire)$/i, 10],
  [/^(handlung|inhalt)$/i, 10],
  [/^(あらすじ|ストーリー|物語)$/, 10],
  [/^(história|historia)$/i, 6],
  [/^(premise|premissa|premisa|prémisse|setting|ambientação|contexto|background)$/i, 3]
]
const CONTAINS = /\b(plot|synopsis|storyline|enredo|sinopse|sinopsis|trama|intrigue|handlung)\b/i
const EXCLUDE =
  /(develop|producti|recep|writ|music|design|cast|charact|personag|desenvolv|produ[çc]|crít|legacy|legado|theme|tema|influen|publica|lançamento|release|adapta|gameplay|jogabilidade|differences|diferenças)/i

export function plotScore(title: string): number {
  const t = title.trim()
  for (const [re, score] of RULES) if (re.test(t)) return score
  if (CONTAINS.test(t) && !EXCLUDE.test(t)) return 7
  return 0
}

/** Subsections inside a plot that aren't story chapters. */
export const SKIP_PART =
  /^(characters?|main characters|personagens|elenco|cast|personajes|personnages|gallery|galeria|trivia|curiosidades|locations?|locais|videos?|gameplay|enemies|inimigos|achievements|conquistas|trophies|troféus|weapons|armas|endings? \(gameplay\)|references|referências|notes|notas)$/i

/**
 * Remove voice/actor credits like "Joel (Troy Baker)" and leftovers from
 * stripped templates, so names and sentences stay clean.
 */
export function cleanPlotText(text: string): string {
  return text
    .replace(/\s\((?:voiced by |played by |portrayed by |interpretad[oa] por |dublad[oa] por )?\p{Lu}[\p{L}.'’-]+(?:\s\p{Lu}[\p{L}.'’-]+){1,3}\)/gu, '')
    .replace(/\(\s*[,;]?\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.;:])/g, '$1')
    .trim()
}

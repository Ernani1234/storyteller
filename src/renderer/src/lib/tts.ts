/**
 * Read-aloud through the OS voices (Web Speech API, works offline on Windows).
 * Text is queued paragraph by paragraph: some engines cut long utterances off.
 */
let active = 0

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const code = lang.toLowerCase()
  return (
    voices.find((v) => v.lang.toLowerCase() === code) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(code.slice(0, 2)))
  )
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, lang: string, onEnd: () => void): void {
  if (!ttsSupported()) return onEnd()
  stopSpeaking()
  const run = ++active
  const chunks = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const voice = voiceFor(lang)
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk)
    u.lang = voice?.lang ?? lang
    if (voice) u.voice = voice
    u.rate = 1
    if (i === chunks.length - 1) {
      u.onend = () => run === active && onEnd()
    }
    u.onerror = () => run === active && onEnd()
    window.speechSynthesis.speak(u)
  })
  if (!chunks.length) onEnd()
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return
  active++
  window.speechSynthesis.cancel()
}

import type { ErrorCode } from '../shared/types'

/** An error with a stable code the renderer can translate and act on. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'AppError'
  }
}

interface MaybeApiError {
  name?: string
  status?: number
  code?: string
  message?: string
  error?: { code?: string; message?: string }
}

/** Map anything thrown (OpenAI SDK, fetch, our own) to a code + readable message. */
export function describeError(err: unknown): { code: ErrorCode; error: string } {
  if (err instanceof AppError) return { code: err.code, error: err.message }
  const e = (err ?? {}) as MaybeApiError
  const message = e.error?.message || e.message || String(err)

  if (e.name === 'APIConnectionError' || e.name === 'APIConnectionTimeoutError') {
    return { code: 'CONNECT', error: message }
  }
  switch (e.status) {
    case 401:
    case 403:
      return { code: 'BAD_KEY', error: message }
    case 429:
      return { code: 'QUOTA', error: message }
    case 404:
      return { code: 'MODEL', error: message }
  }
  if (e.name === 'AbortError' || e.name === 'TimeoutError' || /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(message)) {
    return { code: 'NETWORK', error: message }
  }
  if (err instanceof SyntaxError) return { code: 'AI_FORMAT', error: message }
  return { code: 'UNKNOWN', error: message }
}

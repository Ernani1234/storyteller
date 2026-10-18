import type { StorytellerApi } from '../shared/api'

declare global {
  interface Window {
    storyteller: StorytellerApi
  }
}

export {}

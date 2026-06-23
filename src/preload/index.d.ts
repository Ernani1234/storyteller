import type { StorytellerApi } from './index'

declare global {
  interface Window {
    storyteller: StorytellerApi
  }
}

export {}

import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import type { StoryImage } from '../../../shared/types'

interface Props {
  images: StoryImage[]
  start: number
  onClose: () => void
}

export default function Lightbox({ images, start, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [i, setI] = useState(start)
  const img = images[i]

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowRight') setI((x) => (x + 1) % images.length)
      else if (e.key === 'ArrowLeft') setI((x) => (x - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [images.length, onClose])

  if (!img) return <></>
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={img.caption} onClick={onClose}>
      <figure className="lightbox__figure" onClick={(e) => e.stopPropagation()}>
        <img src={img.url.replace(/\/scale-to-width-down\/\d+/, '/scale-to-width-down/1280')} alt={img.caption} />
        <figcaption>
          <span>{img.caption}</span>
          {img.source && (
            <a href={img.source} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} />
            </a>
          )}
        </figcaption>
      </figure>
      {images.length > 1 && (
        <>
          <button
            className="lightbox__nav lightbox__nav--prev"
            aria-label={t('panel.prev')}
            onClick={(e) => {
              e.stopPropagation()
              setI((x) => (x - 1 + images.length) % images.length)
            }}
          >
            <Icon name="chevronLeft" size={22} />
          </button>
          <button
            className="lightbox__nav lightbox__nav--next"
            aria-label={t('panel.next')}
            onClick={(e) => {
              e.stopPropagation()
              setI((x) => (x + 1) % images.length)
            }}
          >
            <Icon name="chevronRight" size={22} />
          </button>
        </>
      )}
      <button className="lightbox__close icon-btn" onClick={onClose} aria-label={t('common.close')}>
        <Icon name="close" />
      </button>
    </div>
  )
}

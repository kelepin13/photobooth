'use client';

import { useLanguage } from '@/lib/i18n';

interface Props {
  code: string;
  slots: (string | null)[];
  columns: number;
  activeSlot: number;
  onSelectSlot: (index: number) => void;
  onClearSlot: (index: number) => void;
  caption: string;
  onCaptionChange: (caption: string) => void;
  busy: boolean;
  onCompose: () => void;
  composedUrl: string | null;
  canShareFiles: boolean;
  onShare: () => void;
  onPublish: () => void;
  publishInfo: { url: string; qrDataUrl: string } | null;
}

export default function StripPanel(props: Props) {
  const { t } = useLanguage();
  const filledCount = props.slots.filter(Boolean).length;

  return (
    <section className="panel">
      <p className="panel-title">{t('room.stripTitle')}</p>
      <div className="strip-grid" style={{ gridTemplateColumns: `repeat(${props.columns}, 1fr)` }}>
        {props.slots.map((slot, i) => (
          <div className={`strip-slot ${slot ? 'filled' : ''} ${props.activeSlot === i ? 'active' : ''}`} key={i}>
            <button
              type="button"
              className="strip-slot-select"
              onClick={() => props.onSelectSlot(i)}
              aria-label={`Slot ${i + 1}`}
              aria-pressed={props.activeSlot === i}
            >
              {slot ? <img src={slot} alt="" /> : <span>{i + 1}</span>}
            </button>
            {slot && (
              <button
                type="button"
                className="retake-chip"
                onClick={() => props.onClearSlot(i)}
                title={t('room.retake')}
                aria-label={`${t('room.retake')} ${i + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <input
        className="caption-input"
        placeholder={t('room.captionPlaceholder')}
        aria-label={t('room.captionLabel')}
        value={props.caption}
        maxLength={60}
        onChange={(e) => props.onCaptionChange(e.target.value)}
      />

      <div className="compose-row">
        <button type="button" className="compose-btn" onClick={props.onCompose} disabled={props.busy || filledCount === 0}>
          {t('room.compose')}
        </button>
      </div>

      {props.composedUrl && (
        <div className="composed-frame">
          <img src={props.composedUrl} alt={t('room.stripTitle')} />
          <a className="download-btn" href={props.composedUrl} download={`photobooth-${props.code}.jpg`}>
            {t('room.download')}
          </a>
          <div className="share-row">
            {/* the download link above already covers browsers without a share sheet */}
            {props.canShareFiles && (
              <button type="button" className="share-btn" onClick={props.onShare}>
                {t('room.share')}
              </button>
            )}
            <button type="button" className="share-btn" onClick={props.onPublish} disabled={props.busy}>
              🔗 {t('room.publishLink')}
            </button>
          </div>
          {props.publishInfo && (
            <div className="publish-box">
              <img src={props.publishInfo.qrDataUrl} alt="QR" width={110} height={110} />
              <a href={props.publishInfo.url} target="_blank" rel="noreferrer" className="publish-link">
                {props.publishInfo.url}
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

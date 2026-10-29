'use client';

import ChipGroup from './ChipGroup';
import { useLanguage } from '@/lib/i18n';
import { FILTERS } from '@/lib/filters';
import type { CaptureLock, FilterName } from '@/types/room';

interface Props {
  code: string;
  lock: CaptureLock | null;
  lockedByOther: boolean;
  pendingPreview: string | null;
  onKeep: () => void;
  onRetake: () => void;
  filter: FilterName;
  onFilterChange: (filter: FilterName) => void;
  busy: boolean;
  countdownRunning: boolean;
  activeSlot: number;
  filledCount: number;
  slotCount: number;
  onCapture: () => void;
  boomerangBusy: boolean;
  boomerangUrl: string | null;
  onBoomerang: () => void;
  history: string[];
  onPickFromHistory: (url: string) => void;
}

export default function CaptureControls(props: Props) {
  const { t } = useLanguage();

  return (
    <>
      {props.lockedByOther && (
        <p className="lock-text" aria-live="polite">
          📸 <strong>{props.lock?.name}</strong> {t('room.lockedByOther')} {t('room.lockedWait')}
        </p>
      )}

      {props.pendingPreview ? (
        <div className="preview-box">
          <p className="panel-title">{t('room.previewTitle')}</p>
          <img src={props.pendingPreview} alt={t('room.previewTitle')} className="preview-img" />
          <div className="preview-actions">
            <button type="button" className="capture-btn" onClick={props.onKeep}>
              {t('room.keep')}
            </button>
            <button type="button" className="retake-btn" onClick={props.onRetake}>
              {t('room.retake')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ChipGroup options={FILTERS} value={props.filter} onChange={props.onFilterChange} labelFor={(f) => t(`filters.${f}`)} />

          <div className="capture-row">
            <button
              type="button"
              className="capture-btn"
              onClick={props.onCapture}
              disabled={props.busy || props.countdownRunning || props.lockedByOther}
            >
              {props.busy
                ? t('room.processing')
                : `${t('room.captureButton')} ${props.activeSlot + 1}${t('room.captureSuffix')} 📷`}
            </button>
            <span className="slots-count">
              {props.filledCount}/{props.slotCount} {t('room.slotsFilled')}
            </span>
            <button
              type="button"
              className="retake-btn"
              onClick={props.onBoomerang}
              disabled={props.boomerangBusy || props.countdownRunning || props.lockedByOther}
            >
              {props.boomerangBusy ? t('room.boomerangBusy') : t('room.boomerang')}
            </button>
          </div>

          {props.boomerangUrl && (
            <div className="preview-box">
              <p className="panel-title">{t('room.boomerangTitle')}</p>
              <video src={props.boomerangUrl} className="preview-img" autoPlay loop muted playsInline />
              <div className="share-row">
                <a className="download-btn" href={props.boomerangUrl} download={`boomerang-${props.code}.webm`}>
                  {t('room.download')}
                </a>
              </div>
            </div>
          )}

          {props.history.length > 0 && (
            <div className="history-row">
              {props.history
                .slice()
                .reverse()
                .map((url, i) => (
                  <button
                    key={url.slice(-32) + i}
                    type="button"
                    className="history-thumb-btn"
                    onClick={() => props.onPickFromHistory(url)}
                    aria-label={`${t('room.captureButton')} ${props.activeSlot + 1}`}
                  >
                    <img src={url} className="history-thumb" alt="" />
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

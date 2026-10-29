'use client';

import type { ChangeEvent, ReactNode, RefObject } from 'react';
import ChipGroup from './ChipGroup';
import { useLanguage } from '@/lib/i18n';
import { AI_EFFECTS, FACE_PROPS, FILTER_CSS } from '@/lib/filters';
import type { AiEffect, FaceProp, FilterName } from '@/types/room';

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  effectsCanvasRef: RefObject<HTMLCanvasElement>;
  effectsActive: boolean;
  modelLoading: boolean;
  filter: FilterName;
  mirrored: boolean;
  onToggleMirror: () => void;
  onSwitchCamera: () => void;
  countdown: number | null;
  flash: boolean;
  cameraError: boolean;
  aiEffect: AiEffect;
  onAiEffectChange: (effect: AiEffect) => void;
  hasCustomBackground: boolean;
  onCustomBackground: (e: ChangeEvent<HTMLInputElement>) => void;
  faceProp: FaceProp;
  onFacePropChange: (prop: FaceProp) => void;
  /** Capture controls, preview, boomerang and history, rendered under the camera. */
  children: ReactNode;
}

export default function CameraPanel(props: Props) {
  const { t } = useLanguage();
  const { videoRef, effectsCanvasRef, effectsActive, filter, mirrored } = props;

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="panel-title">{t('room.camera')}</p>
        <div className="camera-toggles">
          <button
            type="button"
            className={`toggle-chip ${mirrored ? 'active' : ''}`}
            onClick={props.onToggleMirror}
            title={t('room.mirror')}
            aria-label={t('room.mirror')}
            aria-pressed={mirrored}
          >
            🪞
          </button>
          <button
            type="button"
            className="toggle-chip"
            onClick={props.onSwitchCamera}
            title={t('room.switchCamera')}
            aria-label={t('room.switchCamera')}
          >
            🔄
          </button>
        </div>
      </div>

      <div className="camera-frame">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            filter: FILTER_CSS[filter],
            transform: mirrored ? 'scaleX(-1)' : 'none',
            display: effectsActive ? 'none' : 'block',
          }}
        />
        <canvas
          ref={effectsCanvasRef}
          style={{ width: '100%', height: '100%', display: effectsActive ? 'block' : 'none' }}
        />
        {effectsActive && props.modelLoading && (
          <div className="countdown-overlay" style={{ fontSize: 16 }}>
            {t('aiEffects.loading')}
          </div>
        )}
        {props.countdown !== null && (
          <div className="countdown-overlay" aria-live="assertive">
            {props.countdown}
          </div>
        )}
        {props.flash && <div className="flash-overlay" />}
      </div>

      {props.cameraError && (
        <p className="error-text" role="alert">
          ⚠️ {t('room.cameraError')}
        </p>
      )}

      <ChipGroup
        label={t('aiEffects.title')}
        options={AI_EFFECTS}
        value={props.aiEffect}
        onChange={props.onAiEffectChange}
        labelFor={(e) => t(`aiEffects.${e}`)}
      />
      {props.aiEffect === 'replace-custom' && (
        <div style={{ marginTop: 8 }}>
          <input
            type="file"
            accept="image/*"
            onChange={props.onCustomBackground}
            className="join-input"
            style={{ padding: 8 }}
            aria-label={t('aiEffects.uploadPrompt')}
          />
          {!props.hasCustomBackground && (
            <p className="panel-title" style={{ marginTop: 6 }}>
              {t('aiEffects.uploadPrompt')}
            </p>
          )}
        </div>
      )}

      <ChipGroup
        label={t('faceProps.title')}
        options={FACE_PROPS}
        value={props.faceProp}
        onChange={props.onFacePropChange}
        labelFor={(p) => t(`faceProps.${p}`)}
      />

      {props.children}
    </section>
  );
}

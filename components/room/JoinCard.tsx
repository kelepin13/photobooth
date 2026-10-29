'use client';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n';

interface Props {
  code: string;
  name: string;
  onNameChange: (name: string) => void;
  hasPin: boolean;
  pin: string;
  onPinChange: (pin: string) => void;
  pinError: string | null;
  onJoin: () => void;
}

export default function JoinCard({ code, name, onNameChange, hasPin, pin, onPinChange, pinError, onJoin }: Props) {
  const { t } = useLanguage();
  const canJoin = name.trim() !== '' && (!hasPin || pin !== '');

  return (
    <div className="join-wrap">
      <LanguageSwitcher />
      <form
        className="join-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (canJoin) onJoin();
        }}
      >
        <div className="join-tape" />
        <span className="join-icon">📸</span>
        <h1 className="join-title">{t('join.title')}</h1>
        <div className="join-code">{code}</div>
        <p className="join-sub">{t('join.subtitle')}</p>
        <input
          className="join-input"
          placeholder={t('join.placeholder')}
          aria-label={t('join.placeholder')}
          value={name}
          maxLength={30}
          onChange={(e) => onNameChange(e.target.value)}
          autoFocus
        />
        {hasPin && (
          <input
            className="join-input"
            style={{ marginTop: 10 }}
            placeholder={t('join.pinPlaceholder')}
            aria-label={t('join.pinPlaceholder')}
            value={pin}
            onChange={(e) => onPinChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
          />
        )}
        {pinError && (
          <p className="error-text" role="alert" style={{ marginTop: 10 }}>
            {pinError}
          </p>
        )}
        <button className="join-button" type="submit" disabled={!canJoin}>
          {t('join.button')}
        </button>
      </form>
    </div>
  );
}

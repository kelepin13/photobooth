'use client';

import { useLanguage } from '@/lib/i18n';

export function RoomLoading() {
  return (
    <div className="join-wrap">
      <div className="skeleton-card" aria-busy="true">
        <div className="skeleton-line skeleton-icon" />
        <div className="skeleton-line" style={{ width: '70%', height: 24, margin: '0 auto 10px' }} />
        <div className="skeleton-line" style={{ width: '50%', height: 16, margin: '0 auto 24px' }} />
        <div className="skeleton-line" style={{ height: 46 }} />
      </div>
    </div>
  );
}

export function RoomNotFound() {
  const { t } = useLanguage();
  return (
    <div className="join-wrap">
      <div className="join-card">
        <span className="join-icon">🙈</span>
        <h1 className="join-title">{t('join.notFoundTitle')}</h1>
        <p className="join-sub">{t('join.notFoundSub')}</p>
        <a className="join-button" href="/">
          {t('join.notFoundButton')}
        </a>
      </div>
    </div>
  );
}

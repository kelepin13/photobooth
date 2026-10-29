'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import type { Layout } from '@/types/room';

const LAYOUT_OPTIONS: { id: Layout; icon: string; labelKey: string }[] = [
  { id: '2x2', icon: '▦', labelKey: 'home.layout2x2' },
  { id: '1x4', icon: '▤', labelKey: 'home.layout1x4' },
  { id: '1x2', icon: '▥', labelKey: 'home.layout1x2' },
  { id: '2x3', icon: '▧', labelKey: 'home.layout2x3' },
];

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<Layout>('2x2');
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useLanguage();

  async function createRoom() {
    if (usePin && !/^\d{4,6}$/.test(pin)) {
      setError(t('home.pinInvalid'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout, pin: usePin ? pin : undefined }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      router.push(`/room/${data.code}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home-wrap">
      <div className="confetti-bg" />
      <LanguageSwitcher />
      <div className="home-card">
        <div className="home-tape" />
        <span className="home-icon">📸</span>
        <h1 className="home-title">{t('home.title')}</h1>
        <p className="home-sub">{t('home.subtitle')}</p>

        <p className="layout-label">{t('home.layoutLabel')}</p>
        <div className="layout-options">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`layout-option ${layout === opt.id ? 'active' : ''}`}
              onClick={() => setLayout(opt.id)}
              type="button"
            >
              <span className="layout-icon">{opt.icon}</span>
              {t(opt.labelKey)}
            </button>
          ))}
        </div>

        <label className="pin-toggle-row">
          <input type="checkbox" checked={usePin} onChange={(e) => setUsePin(e.target.checked)} />
          {t('home.pinToggle')}
        </label>
        {usePin && (
          <input
            className="pin-input"
            placeholder={t('home.pinPlaceholder')}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
          />
        )}
        {error && <p className="error-text">{error}</p>}

        <button className="home-button" onClick={createRoom} disabled={loading} style={{ marginTop: 16 }}>
          {loading ? t('home.buttonLoading') : t('home.button')}
        </button>
      </div>
    </div>
  );
}

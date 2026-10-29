'use client';

import { useLanguage, type Lang } from '@/lib/i18n';

const OPTIONS: { id: Lang; label: string }[] = [
  { id: 'id', label: 'ID' },
  { id: 'en', label: 'EN' },
  { id: 'zh', label: '中' },
];

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="lang-switcher">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          className={`lang-pill ${lang === opt.id ? 'active' : ''}`}
          onClick={() => setLang(opt.id)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

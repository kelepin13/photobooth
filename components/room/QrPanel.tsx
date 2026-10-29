'use client';

import { useLanguage } from '@/lib/i18n';
import type { Participant } from '@/types/room';

export default function QrPanel({ qrDataUrl, participants }: { qrDataUrl?: string; participants: Participant[] }) {
  const { t } = useLanguage();
  return (
    <section className="panel">
      <p className="panel-title">{t('room.shareQr')}</p>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {qrDataUrl && <img className="qr-frame" src={qrDataUrl} alt="Join QR code" width={130} height={130} />}
        <div className="qr-meta">
          <strong>
            {participants.length} {t('room.friendsJoined')}
          </strong>
          <div className="participant-chips">
            {participants.map((p, i) => (
              <span className="participant-chip" key={`${p.name}-${i}`}>
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

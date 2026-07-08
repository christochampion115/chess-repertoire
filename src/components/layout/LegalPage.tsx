import React from 'react';

interface LegalPageProps {
  title: string;
}

export const LegalPage = React.memo(function LegalPage({ title }: LegalPageProps) {
  return (
    <div id="view-home" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div className="home-hero-inner" style={{ textAlign: 'center', maxWidth: 640 }}>
        <h1 className="home-hero-title">{title}</h1>
        <p className="home-features-desc" style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.7, marginTop: 16 }}>
          Page en cours de rédaction.
        </p>
      </div>
    </div>
  );
});

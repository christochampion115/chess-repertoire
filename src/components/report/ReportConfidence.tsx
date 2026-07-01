import React from 'react';

interface ReportConfidenceProps {
  total: number;
}

export const ReportConfidence = React.memo(function ReportConfidence({ total }: ReportConfidenceProps) {
  const filled = total >= 100 ? 5 : total >= 50 ? 4 : total >= 20 ? 3 : total >= 8 ? 2 : 1;
  const label = total >= 100 ? 'Très fiable' : total >= 30 ? 'Fiable' : total >= 10 ? 'Échantillon moyen' : 'Peu de données';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i < filled ? '#3B82F6' : 'rgba(148,163,184,0.12)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{label}</span>
    </div>
  );
});

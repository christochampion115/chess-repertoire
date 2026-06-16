import React from 'react';
import { escapeHtml } from '@/services/openings';

interface ReportMetricHelpProps {
  label: string;
  helpText: string;
}

export const ReportMetricHelp = React.memo(function ReportMetricHelp({ label, helpText }: ReportMetricHelpProps) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'help' }}>
      {label}
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid rgba(148,163,184,.35)',
          color: '#94a3b8',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.6rem',
          fontWeight: 800,
        }}
      >
        i
      </span>
      <span
        className="metric-help-bubble"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 'calc(100% + 10px)',
          transform: 'translateX(-50%)',
          width: 220,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#0b1526',
          border: '1px solid rgba(148,163,184,0.18)',
          color: '#e2e8f0',
          textTransform: 'none',
          letterSpacing: 0,
          lineHeight: 1.45,
          fontSize: '0.74rem',
          fontWeight: 500,
          opacity: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          transition: 'opacity 0.16s ease 0.4s, visibility 0s linear 0.4s',
          zIndex: 5,
        }}
        dangerouslySetInnerHTML={{ __html: escapeHtml(helpText) }}
      />
    </span>
  );
});

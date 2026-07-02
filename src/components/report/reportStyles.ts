export const cardBg = 'linear-gradient(160deg, rgba(15,25,50,0.9) 0%, rgba(8,16,29,0.95) 100%)';
export const cardRadius = 14;
export const cardShadow = '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)';

export const cardLg: React.CSSProperties = {
  background: cardBg,
  borderRadius: cardRadius,
  boxShadow: cardShadow,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

export const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '13px 26px',
  background: 'linear-gradient(135deg, #00E5FF, #0066FF)',
  color: '#030712',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.92rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0,229,255,0.5), 0 0 20px rgba(0,102,255,0.35)',
  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
};

export const btnSecondary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  padding: '7px 14px',
  borderRadius: 8,
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 0.2s ease, color 0.2s ease',
};

export const btnGhost: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  padding: '4px 10px',
  borderRadius: 8,
  fontSize: '0.68rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'color 0.2s ease',
};

export const titleGradient: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4FFFFF, #40B0FF, #0090FF)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  filter: 'drop-shadow(0 0 24px rgba(0,132,255,0.4))',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(15,23,42,0.92)',
  border: 'none',
  boxShadow: 'inset 0 1px 2px rgba(70,150,255,0.2)',
  borderRadius: 8,
  color: '#e2e8f0',
  colorScheme: 'dark',
  padding: '10px 14px',
  fontSize: '0.92rem',
  outline: 'none',
  transition: 'box-shadow 0.2s ease',
};

export const selectStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,0.92)',
  border: 'none',
  boxShadow: 'inset 0 1px 2px rgba(70,150,255,0.2)',
  borderRadius: 6,
  color: '#e2e8f0',
  colorScheme: 'dark',
  padding: '9px 12px',
  fontSize: '0.88rem',
  outline: 'none',
  cursor: 'pointer',
  transition: 'box-shadow 0.2s ease',
};

export const tagGradient = 'linear-gradient(180deg, rgba(70,150,255,0.12), rgba(70,150,255,0.05))';
export const tagBorder = 'inset 0 1px 2px rgba(70,150,255,0.15)';

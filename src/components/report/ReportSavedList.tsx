import React, { useEffect, useState, useCallback } from 'react';
import { fetchSavedReports, deleteSavedReportOnServer } from '@/services/report';
import type { SavedReportMeta } from '@/types/report';
import { cardLg } from './reportStyles';
import './report.css';

interface ReportSavedListProps {
  onLoad: (id: number) => void;
}

export const ReportSavedList = React.memo(function ReportSavedList({ onLoad }: ReportSavedListProps) {
  const [reports, setReports] = useState<SavedReportMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchSavedReports();
      setReports(list);
    } catch {
      setReports([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Supprimer ce rapport ?')) return;
    try {
      await deleteSavedReportOnServer(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch { /* empty */ }
  }, []);

  const dateLabel = (r: SavedReportMeta) => {
    if (r.params.dateFrom && r.params.dateTo) return `${r.params.dateFrom} → ${r.params.dateTo}`;
    if (r.params.dateFrom) return r.params.dateFrom;
    if (r.params.dateTo) return r.params.dateTo;
    return null;
  };

  return (
    <div style={{ marginTop: 32, borderTop: '1px solid rgba(148,163,184,0.08)', paddingTop: 24 }}>
      <style>{`
        .saved-report-card:hover .saved-report-del {
          opacity: 1 !important;
        }
        .saved-report-del { transition: opacity 0.2s; }
      `}</style>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
        Rapports sauvegardés
      </div>

      {loading && (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          Chargement…
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
          Aucun rapport sauvegardé pour le moment.
        </div>
      )}

      {reports.map((r) => (
        <div
          key={r.id}
          onClick={() => onLoad(r.id)}
          className="saved-report-card"
          style={{
            ...cardLg,
            padding: '14px 18px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            cursor: 'pointer',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
              {r.params.username} · {r.params.color === 'white' ? '♔ Blancs' : '♚ Noirs'} · {r.params.timeClass}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              {dateLabel(r) && <>{dateLabel(r)} · </>}
              {r.totalGames} partie{r.totalGames > 1 ? 's' : ''}
              {r.baselineScore != null ? ` · ${(r.baselineScore * 100).toFixed(0)}%` : ''}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
              {new Date(r.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>
          <button
            type="button"
            className="saved-report-del"
            style={{ opacity: 0.3, background: 'none', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '6px 8px', fontSize: '0.9rem', cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
          >
            🗑️
          </button>
        </div>
      ))}
    </div>
  );
});

/**
 * Consistent color system for farm statuses across the entire app.
 *
 * Gray   (#6b7280) — Pending: not yet analyzed
 * Green  (#22c55e) — Maize: confirmed maize crop
 * Red    (#ef4444) — Not Maize: confirmed non-maize
 * Orange (#f97316) — Error/Flagged: analysis failed or needs review
 */
export const getStatusColor = (status: string) => {
  switch (status) {
    case 'maize':
    case 'verified':
      return '#22c55e'; // Green
    case 'non-maize':
    case 'rejected':
      return '#ef4444'; // Red
    case 'flagged':
      return '#f97316'; // Orange
    case 'pending':
    default:
      return '#6b7280'; // Gray
  }
};

/** Human-readable status label */
export const getStatusLabel = (status: string) => {
  switch (status) {
    case 'maize': return 'Maize';
    case 'verified': return 'Maize (Verified)';
    case 'pending': return 'Pending Analysis';
    case 'non-maize': return 'Not Maize';
    case 'rejected': return 'Rejected';
    case 'flagged': return 'Needs Review';
    default: return 'Pending';
  }
};

export const generateHeatmapData = (centerLat: number, centerLng: number, count: number) => {
  const data = [];
  for (let i = 0; i < count; i++) {
    const lat = centerLat + (Math.random() - 0.5) * 0.08;
    const lng = centerLng + (Math.random() - 0.5) * 0.08;
    const weight = Math.random();
    data.push({ lat, lng, weight });
  }
  return data;
};

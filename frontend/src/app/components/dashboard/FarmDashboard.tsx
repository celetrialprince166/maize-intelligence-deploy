import React, { useState } from 'react';
import { 
  CheckCircle2, XCircle, AlertCircle, FileDown, Leaf, Calendar, 
  Droplets, User, MapPin, History, Activity, Thermometer, Mountain,
  ChevronDown, ChevronUp, Pencil, Play
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { getStatusLabel } from '@/app/components/map/utils';

interface FarmDashboardProps {
  data: any;
  onAction: (action: string, payload?: any) => void;
  onRename?: (farmId: string, newName: string) => void;
}

export const FarmDashboard: React.FC<FarmDashboardProps> = ({ data, onAction, onRename }) => {
  const farmId = data?.id || 'F-Unknown';
  const status = data?.status || 'pending';
  const yieldVal = data?.yield || 0;
  const area = data?.area || 0;
  const farmName = data?.name || 'Unnamed Farm';
  const confidence = data?.confidence ? Math.round(data.confidence * 100) : 0;
  const year = data?.year || new Date().getFullYear();

  // Get per-season analysis data
  const analysis = data?.analyses?.[year];
  const timeSeries = analysis?.time_series || [];
  const ancillary = analysis?.ancillary;
  const comparison = analysis?.comparison;
  const pixelGrid = analysis?.pixel_grid;

  const [expandedSection, setExpandedSection] = useState<string | null>('spectral');

  // Derive crop health from yield or analysis data
  const healthStatus = analysis?.health_status || (
    yieldVal >= 2.5 ? 'excellent' : yieldVal >= 1.5 ? 'good' : yieldVal >= 0.8 ? 'moderate' : yieldVal > 0 ? 'poor' : null
  );
  const healthIcon = healthStatus === 'excellent' ? '🌟' : healthStatus === 'good' ? '✅' : healthStatus === 'moderate' ? '⚠️' : healthStatus === 'poor' ? '🔴' : '';

  const getRegion = () => {
    if (!data?.center) return 'Unknown Region';
    const lat = data.center[0];
    if (lat >= 9.0 && lat <= 11.0) return 'Northern Ghana';
    if (lat >= 5.4 && lat <= 6.2) return 'Greater Accra';
    if (lat >= 7.5 && lat <= 9.0) return 'Bono / Ashanti';
    return 'Ghana';
  };

  const toggleSection = (id: string) => setExpandedSection(prev => prev === id ? null : id);

  // Spectral indices from the analysis
  const spectralIndices = [
    { name: 'NDVI', value: analysis?.ancillary ? undefined : undefined, color: '#10b981' },
    { name: 'EVI', value: undefined, color: '#3b82f6' },
    { name: 'NDMI', value: undefined, color: '#06b6d4' },
    { name: 'GCVI', value: undefined, color: '#84cc16' },
    { name: 'NDRE', value: undefined, color: '#f59e0b' },
  ];

  // Try to extract indices from time-series (last entry) or from stored data
  const latestTs = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null;
  const indices = {
    ndvi: latestTs?.ndvi ?? data?.analyses?.[year]?.ndvi,
    evi: latestTs?.evi,
    ndmi: latestTs?.ndmi,
    gcvi: latestTs?.gcvi,
    ndre: latestTs?.ndre,
  };

  // Variable importance (from the GEE model — hardcoded from training)
  const variableImportance = [
    { name: 'NDVI', importance: 18.2 },
    { name: 'EVI', importance: 14.5 },
    { name: 'GCVI', importance: 12.8 },
    { name: 'NDRE', importance: 11.3 },
    { name: 'NDMI', importance: 9.7 },
    { name: 'MTCI', importance: 8.1 },
    { name: 'precip', importance: 7.4 },
    { name: 'temp_max', importance: 5.9 },
    { name: 'elevation', importance: 4.8 },
    { name: 'SOC', importance: 3.6 },
    { name: 'slope', importance: 2.1 },
    { name: 'B8_nir', importance: 1.6 },
  ];

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(farmName);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== farmName && onRename) {
      onRename(farmId, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col space-y-3 font-sans text-white overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded">
      
      {/* Identity Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
            <User size={14} className="text-white/70" />
          </div>
          <div className="flex flex-col">
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditName(farmName); setIsEditing(false); } }}
                autoFocus
                className="text-sm font-medium text-white bg-white/10 border border-emerald-500/50 rounded px-1.5 py-0.5 outline-none w-40"
              />
            ) : (
              <button onClick={() => { setEditName(farmName); setIsEditing(true); }} className="flex items-center gap-1 group text-left">
                <h2 className="text-sm font-medium text-white tracking-tight leading-none">{farmName}</h2>
                <Pencil size={10} className="text-white/20 group-hover:text-emerald-400 transition-colors" />
              </button>
            )}
            <span className="text-[9px] text-white/40 font-mono uppercase mt-0.5">ID: {farmId}</span>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* === KEY RESULTS: Classification / Crop Health / Yield === */}
      <div className="space-y-2">
        {/* Classification */}
        <div className={`rounded-lg p-3 border ${
          status === 'maize' || status === 'verified' 
            ? 'bg-emerald-500/10 border-emerald-500/20' 
            : status === 'non-maize' || status === 'rejected'
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-white/5 border-white/10'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider mb-0.5">Classification</div>
              <div className={`text-base font-medium ${
                status === 'maize' || status === 'verified' ? 'text-emerald-400' : 
                status === 'non-maize' || status === 'rejected' ? 'text-red-400' : 'text-white/60'
              }`}>
                {status === 'maize' || status === 'verified' ? '🌽 Maize' : status === 'non-maize' || status === 'rejected' ? '❌ Non-Maize' : '⏳ Pending'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-white/40 uppercase">Confidence</div>
              <div className="text-lg font-light text-white">{confidence > 0 ? `${confidence}%` : '—'}</div>
            </div>
          </div>
          <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-2">
            <div className={`h-full rounded-full transition-all ${
              status === 'maize' || status === 'verified' ? 'bg-emerald-500' : 
              status === 'non-maize' || status === 'rejected' ? 'bg-red-500' : 'bg-white/30'
            }`} style={{ width: `${confidence}%` }} />
          </div>
        </div>

        {/* Crop Health */}
        <div className={`rounded-lg p-3 border ${
          healthStatus === 'excellent' ? 'bg-emerald-500/10 border-emerald-500/20' :
          healthStatus === 'good' ? 'bg-green-500/10 border-green-500/20' :
          healthStatus === 'moderate' ? 'bg-amber-500/10 border-amber-500/20' :
          healthStatus === 'poor' ? 'bg-red-500/10 border-red-500/20' :
          'bg-white/5 border-white/10'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider mb-0.5">Crop Health</div>
              <div className={`text-base font-medium capitalize ${
                healthStatus === 'excellent' ? 'text-emerald-400' :
                healthStatus === 'good' ? 'text-green-400' :
                healthStatus === 'moderate' ? 'text-amber-400' :
                healthStatus === 'poor' ? 'text-red-400' : 'text-white/60'
              }`}>
                {healthStatus ? `${healthIcon} ${healthStatus}` : '— Not analyzed'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-white/40 uppercase">NDVI</div>
              <div className="text-lg font-light text-white font-mono">
                {indices.ndvi != null && isFinite(indices.ndvi) ? indices.ndvi.toFixed(3) : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Yield Estimation */}
        <div className={`rounded-lg p-3 border ${yieldVal > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider mb-0.5">Yield Estimation</div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl font-light ${yieldVal > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
                  {yieldVal > 0 ? yieldVal.toFixed(2) : '—'}
                </span>
                <span className="text-[10px] text-emerald-400/60">t/ha</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-white/40 uppercase">Area</div>
              <div className="text-sm font-light text-white">{area > 0 ? `${area.toFixed(1)} ha` : '—'}</div>
              {yieldVal > 0 && area > 0 && (
                <div className="text-[9px] text-white/30 mt-0.5">≈ {(yieldVal * area).toFixed(1)} tons total</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* View in Dashboard button */}
      <button
        onClick={() => onAction('view-in-dashboard', data)}
        className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 border border-indigo-500/20"
      >
        <Activity size={12} /> View Full Analysis in Dashboard
      </button>


      {/* Spectral Indices Section */}
      <CollapsibleSection
        id="spectral"
        title="Spectral Indices"
        icon={<Activity size={12} />}
        expanded={expandedSection === 'spectral'}
        onToggle={() => toggleSection('spectral')}
      >
        <div className="grid grid-cols-3 gap-1.5">
          <IndexChip label="NDVI" value={indices.ndvi} color="#10b981" description="Vegetation greenness" />
          <IndexChip label="EVI" value={indices.evi} color="#3b82f6" description="Enhanced vegetation" />
          <IndexChip label="NDMI" value={indices.ndmi} color="#06b6d4" description="Moisture stress" />
          <IndexChip label="GCVI" value={indices.gcvi} color="#84cc16" description="Chlorophyll content" />
          <IndexChip label="NDRE" value={indices.ndre} color="#f59e0b" description="Red-edge vigor" />
        </div>
      </CollapsibleSection>

      {/* Time-Series Chart */}
      {timeSeries.length >= 2 && (
        <CollapsibleSection
          id="timeseries"
          title={`NDVI Time-Series (${year})`}
          icon={<Activity size={12} />}
          expanded={expandedSection === 'timeseries'}
          onToggle={() => toggleSection('timeseries')}
        >
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="date" stroke="#555" fontSize={8} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis stroke="#555" fontSize={8} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '6px', fontSize: '10px' }}
                  labelStyle={{ color: '#aaa' }}
                />
                <Line type="monotone" dataKey="ndvi" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} name="NDVI" />
                <Line type="monotone" dataKey="evi" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="EVI" />
                <Line type="monotone" dataKey="ndmi" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="NDMI" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 mt-1 justify-center">
            <LegendDot color="#10b981" label="NDVI" />
            <LegendDot color="#3b82f6" label="EVI" />
            <LegendDot color="#06b6d4" label="NDMI" />
          </div>
        </CollapsibleSection>
      )}

      {/* Ancillary / Environmental Data */}
      {ancillary && (
        <CollapsibleSection
          id="ancillary"
          title="Environmental Context"
          icon={<Thermometer size={12} />}
          expanded={expandedSection === 'ancillary'}
          onToggle={() => toggleSection('ancillary')}
        >
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <DetailRow icon={<Mountain size={10} />} label="Elevation" value={`${ancillary.elevation?.toFixed(0) || 'N/A'} m`} />
            <DetailRow icon={<Mountain size={10} />} label="Slope" value={`${ancillary.slope?.toFixed(1) || 'N/A'}%`} />
            <DetailRow icon={<Droplets size={10} />} label="Rainfall" value={`${ancillary.precip?.toFixed(0) || 'N/A'} mm`} />
            <DetailRow icon={<Thermometer size={10} />} label="Temp Max" value={`${ancillary.temp_max?.toFixed(1) || 'N/A'} °C`} />
            <DetailRow icon={<Leaf size={10} />} label="Soil OC" value={`${ancillary.SOC?.toFixed(1) || 'N/A'} g/kg`} />
          </div>
          {ancillary.sources && (
            <div className="mt-2 text-[8px] text-white/30">
              Sources: {Object.entries(ancillary.sources).map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Variable Importance */}
      <CollapsibleSection
        id="importance"
        title="Model Variable Importance"
        icon={<Activity size={12} />}
        expanded={expandedSection === 'importance'}
        onToggle={() => toggleSection('importance')}
      >
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={variableImportance.slice(0, 8)} layout="vertical" margin={{ left: 40, right: 8 }}>
              <XAxis type="number" stroke="#555" fontSize={8} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke="#555" fontSize={8} tickLine={false} width={40} />
              <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #333', fontSize: '10px' }} />
              <Bar dataKey="importance" radius={[0, 3, 3, 0]}>
                {variableImportance.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={i < 3 ? '#10b981' : i < 6 ? '#3b82f6' : '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>


      {/* Farm Details */}
      <CollapsibleSection
        id="details"
        title="Farm Details"
        icon={<Calendar size={12} />}
        expanded={expandedSection === 'details'}
        onToggle={() => toggleSection('details')}
      >
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <DetailRow icon={<Leaf size={10} />} label="Crop" value={status === 'maize' || status === 'verified' ? 'Maize' : 'Unknown'} />
          <DetailRow icon={<Calendar size={10} />} label="Season" value={data?.year ? `${data.year}` : 'N/A'} />
          <DetailRow icon={<Droplets size={10} />} label="Area" value={area > 0 ? `${area.toFixed(1)} ha` : 'N/A'} />
          <DetailRow icon={<History size={10} />} label="Status" value={getStatusLabel(status)} />
        </div>
        {comparison && comparison.district_avg_yield > 0 && (
          <div className="mt-2 p-2 bg-white/5 rounded border border-white/5 text-[9px]">
            <div className="text-white/50 mb-1">District Comparison</div>
            <div className="flex justify-between">
              <span className="text-white/70">District Avg Yield</span>
              <span className="text-white/90">{comparison.district_avg_yield.toFixed(2)} t/ha</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">Yield Percentile</span>
              <span className="text-white/90">{comparison.yield_percentile?.toFixed(0) || 'N/A'}%</span>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Actions</label>
        
        {/* Analyze / Re-analyze button */}
        {(status === 'pending' || !analysis) ? (
          <button
            onClick={() => onAction('analyze-farm', data)}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <Play size={12} /> Run Analysis
          </button>
        ) : (
          <button
            onClick={() => onAction('analyze-farm', data)}
            className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 border border-white/10"
          >
            <Play size={12} /> Re-analyze
          </button>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton icon={<CheckCircle2 size={12} />} label="Verify" onClick={() => onAction('verify')} variant="primary" />
          <ActionButton icon={<XCircle size={12} />} label="Reject" onClick={() => onAction('reject')} variant="danger" />
          <ActionButton icon={<AlertCircle size={12} />} label="Flag Issue" onClick={() => onAction('flag')} variant="warning" />
          <ActionButton icon={<FileDown size={12} />} label="Export PDF" onClick={() => onAction('export')} variant="secondary" />
        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---

const MetricCard = ({ label, value, unit, color, icon, subtext }: any) => (
  <div className="bg-white/5 rounded-lg p-2 border border-white/5 relative overflow-hidden group">
    {icon && <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">{icon}</div>}
    <div className="text-[8px] text-white/40 uppercase mb-0.5">{label}</div>
    <div className="flex items-baseline gap-1">
      <span className={`text-xl font-light ${color === 'emerald' ? 'text-emerald-400' : 'text-white'}`}>{value}</span>
      <span className={`text-[10px] ${color === 'emerald' ? 'text-emerald-400/60' : 'text-white/40'}`}>{unit}</span>
    </div>
    {subtext && (
      <div className="flex items-center gap-1 mt-1 text-[9px] text-white/30 truncate">
        <MapPin size={9} /><span>{subtext}</span>
      </div>
    )}
  </div>
);

const IndexChip = ({ label, value, color, description }: { label: string; value?: number; color: string; description: string }) => (
  <div className="bg-white/5 rounded-lg p-1.5 border border-white/5 text-center">
    <div className="text-[8px] text-white/40 uppercase">{label}</div>
    <div className="text-sm font-mono font-medium" style={{ color }}>
      {value != null && isFinite(value) ? value.toFixed(3) : '—'}
    </div>
    <div className="text-[7px] text-white/25 mt-0.5">{description}</div>
  </div>
);

const CollapsibleSection = ({ id, title, icon, expanded, onToggle, children }: any) => (
  <div className="border border-white/5 rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 transition-colors text-left"
    >
      <span className="text-[10px] text-white/70 font-medium flex items-center gap-1.5">
        {icon} {title}
      </span>
      {expanded ? <ChevronUp size={12} className="text-white/40" /> : <ChevronDown size={12} className="text-white/40" />}
    </button>
    {expanded && <div className="p-2 bg-black/30">{children}</div>}
  </div>
);

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1 text-[8px] text-white/50">
    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </div>
);

const DetailRow = ({ icon, label, value }: any) => (
  <div className="flex items-center justify-between bg-white/5 p-1.5 rounded border border-white/5">
    <div className="flex items-center gap-1.5 text-white/50">{icon}<span>{label}</span></div>
    <span className="text-white/90 font-medium truncate ml-1 text-right">{value}</span>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    maize: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    'non-maize': "bg-red-500/10 text-red-400 border-red-500/20",
    rejected: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    flagged: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${styles[status] || styles.pending} uppercase tracking-wider shrink-0`}>
      {getStatusLabel(status)}
    </span>
  );
};

const ActionButton = ({ icon, label, onClick, variant }: any) => {
  const base = "flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 active:scale-95";
  const variants: Record<string, string> = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20",
    danger: "bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/70 border border-white/5",
    warning: "bg-white/5 hover:bg-yellow-500/20 hover:text-yellow-400 text-white/70 border border-white/5",
    secondary: "bg-white/5 hover:bg-white/10 text-white/70 border border-white/5",
  };
  return <button onClick={onClick} className={`${base} ${variants[variant]}`}>{icon} {label}</button>;
};

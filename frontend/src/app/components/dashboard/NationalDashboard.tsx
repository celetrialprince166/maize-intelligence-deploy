import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Folder, FolderOpen, Search, X, MapPin, Leaf, ArrowLeft, Filter } from 'lucide-react';
import { District, Farm } from '@/app/services/storage';

interface DashboardProps {
  onAction: (action: string, payload?: any) => void;
  districts?: District[];
  farms?: Farm[];
  activeSeason?: number;
}

// Helpers to read from analyses
const getFarmYield = (f: Farm): number => {
  if (f.analyses) {
    for (const yr of Object.keys(f.analyses).map(Number).sort((a, b) => b - a)) {
      const a = f.analyses[yr];
      if (a?.yield && a.yield > 0) return a.yield;
    }
  }
  return f.yield || 0;
};
const getFarmStatus = (f: Farm): string => {
  if (f.analyses) {
    for (const yr of Object.keys(f.analyses).map(Number).sort((a, b) => b - a)) {
      const a = f.analyses[yr];
      if (a?.status && a.status !== 'pending') return a.status;
    }
  }
  return f.status || 'pending';
};
const getFarmArea = (f: Farm): number => {
  if (f.analyses) {
    for (const yr of Object.keys(f.analyses).map(Number).sort((a, b) => b - a)) {
      const a = f.analyses[yr];
      if (a?.area && a.area > 0) return a.area;
    }
  }
  return f.area || 0;
};

const getRegion = (farm: Farm): string => {
  if (!farm.center) return 'Unknown';
  const lat = farm.center[0];
  if (lat >= 9.70 && lat <= 9.90) return 'Gushegu';
  if (lat >= 9.50 && lat <= 9.65) return 'Nanton';
  if (lat >= 9.30 && lat <= 9.55) return 'Tamale Metropolitan';
  if (lat >= 9.0 && lat <= 11.0) return 'Northern Region';
  if (lat >= 7.5 && lat <= 9.0) return 'Bono / Ashanti';
  return 'Other';
};

const statusColor = (s: string) =>
  s === 'maize' || s === 'verified' ? '#22c55e' :
  s === 'non-maize' || s === 'rejected' ? '#ef4444' :
  s === 'flagged' ? '#f97316' : '#6b7280';

export const NationalDashboard: React.FC<DashboardProps> = ({ onAction, districts = [], farms = [], activeSeason }) => {
  const season = activeSeason || new Date().getFullYear();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Group farms by region
  const regionGroups = useMemo(() => {
    const groups: Record<string, { farms: Farm[]; totalArea: number; avgYield: number; center: [number, number] }> = {};
    farms.forEach(f => {
      const region = getRegion(f);
      if (!groups[region]) groups[region] = { farms: [], totalArea: 0, avgYield: 0, center: [0, 0] };
      groups[region].farms.push(f);
      groups[region].totalArea += getFarmArea(f);
    });
    // Compute averages and centers
    Object.values(groups).forEach(g => {
      const yields = g.farms.map(f => getFarmYield(f)).filter(y => y > 0);
      g.avgYield = yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : 0;
      if (g.farms.length > 0) {
        const latSum = g.farms.reduce((s, f) => s + f.center[0], 0);
        const lngSum = g.farms.reduce((s, f) => s + f.center[1], 0);
        g.center = [latSum / g.farms.length, lngSum / g.farms.length];
      }
    });
    return groups;
  }, [farms]);

  // Filter by search, status, area
  const filteredRegions = useMemo(() => {
    // First apply status + area filters to all farms
    let filtered = [...farms];
    if (filterStatus !== 'all') {
      if (filterStatus === 'maize') filtered = filtered.filter(f => { const s = getFarmStatus(f); return s === 'maize' || s === 'verified'; });
      else if (filterStatus === 'non-maize') filtered = filtered.filter(f => { const s = getFarmStatus(f); return s === 'non-maize' || s === 'rejected'; });
      else filtered = filtered.filter(f => getFarmStatus(f) === filterStatus);
    }
    if (filterArea === 'small') filtered = filtered.filter(f => getFarmArea(f) > 0 && getFarmArea(f) < 5);
    else if (filterArea === 'medium') filtered = filtered.filter(f => getFarmArea(f) >= 5 && getFarmArea(f) < 20);
    else if (filterArea === 'large') filtered = filtered.filter(f => getFarmArea(f) >= 20);

    // Group filtered farms by region
    const groups: typeof regionGroups = {};
    filtered.forEach(f => {
      const region = getRegion(f);
      if (!groups[region]) groups[region] = { farms: [], totalArea: 0, avgYield: 0, center: [0, 0] };
      groups[region].farms.push(f);
      groups[region].totalArea += getFarmArea(f);
    });
    Object.values(groups).forEach(g => {
      const yields = g.farms.map(f => getFarmYield(f)).filter(y => y > 0);
      g.avgYield = yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : 0;
      if (g.farms.length > 0) {
        g.center = [g.farms.reduce((s, f) => s + f.center[0], 0) / g.farms.length, g.farms.reduce((s, f) => s + f.center[1], 0) / g.farms.length];
      }
    });

    // Then apply search
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    const result: typeof groups = {};
    Object.entries(groups).forEach(([region, data]) => {
      const matchingFarms = data.farms.filter(f =>
        (f.name || '').toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || region.toLowerCase().includes(q)
      );
      if (matchingFarms.length > 0 || region.toLowerCase().includes(q)) {
        result[region] = { ...data, farms: matchingFarms.length > 0 ? matchingFarms : data.farms };
      }
    });
    return result;
  }, [regionGroups, searchQuery, farms, filterStatus, filterArea]);

  const totalFiltered = Object.values(filteredRegions).reduce((s, g) => s + g.farms.length, 0);
  const hasActiveFilters = filterStatus !== 'all' || filterArea !== 'all';

  // Summary metrics
  const totalArea = farms.reduce((s, f) => s + getFarmArea(f), 0);
  const validYields = farms.filter(f => getFarmYield(f) > 0);
  const avgYield = validYields.length ? validYields.reduce((s, f) => s + getFarmYield(f), 0) / validYields.length : 0;
  const analyzedCount = farms.filter(f => { const s = getFarmStatus(f); return s !== 'pending'; }).length;

  return (
    <div className="flex flex-col h-full text-white font-sans space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/50 font-semibold">
          <span>Northern Ghana</span>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span>{season}</span>
        </div>
        <span className="text-[9px] text-white/40">{farms.length} farms</span>
      </div>

      {/* Compact Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/5 border border-white/5 rounded-lg p-2">
          <div className="text-[8px] text-white/40 uppercase">Area</div>
          <div className="text-sm font-medium text-white">{totalArea > 0 ? totalArea.toFixed(0) : '—'} <span className="text-[8px] text-white/30">ha</span></div>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-lg p-2">
          <div className="text-[8px] text-white/40 uppercase">Avg Yield</div>
          <div className="text-sm font-medium text-emerald-400">{avgYield > 0 ? avgYield.toFixed(1) : '—'} <span className="text-[8px] text-emerald-400/50">t/ha</span></div>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-lg p-2">
          <div className="text-[8px] text-white/40 uppercase">Analyzed</div>
          <div className="text-sm font-medium text-white">{analyzedCount} <span className="text-[8px] text-white/30">/ {farms.length}</span></div>
        </div>
      </div>


      {/* Search */}
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search farms or regions..."
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
            <X size={10} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-all ${
            showFilters || hasActiveFilters
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'
          }`}
        >
          <Filter size={9} /> Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        </button>
        <span className="text-[9px] text-white/30">{totalFiltered} of {farms.length}</span>
      </div>

      {showFilters && (
        <div className="bg-white/5 rounded-lg p-2 border border-white/10 space-y-2">
          <div>
            <label className="text-[9px] text-white/40 uppercase mb-1 block">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded text-[10px] text-white/80 px-2 py-1 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="maize">Maize / Verified</option>
              <option value="non-maize">Non-Maize</option>
              <option value="pending">Pending</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-white/40 uppercase mb-1 block">Area</label>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded text-[10px] text-white/80 px-2 py-1 focus:outline-none"
            >
              <option value="all">All Sizes</option>
              <option value="small">&lt; 5 ha</option>
              <option value="medium">5 – 20 ha</option>
              <option value="large">&gt; 20 ha</option>
            </select>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => { setFilterStatus('all'); setFilterArea('all'); }}
              className="text-[9px] text-red-400 hover:text-red-300"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Region/Farm Browser */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded">
        {Object.keys(filteredRegions).length === 0 ? (
          <div className="text-center py-6 text-white/30 text-[10px]">
            {farms.length === 0 ? 'No farms yet. Draw or upload to add.' : 'No results match your search.'}
          </div>
        ) : (
          Object.entries(filteredRegions)
            .sort(([, a], [, b]) => b.farms.length - a.farms.length)
            .map(([region, data]) => (
              <div key={region} className="mb-0.5">
                {/* Region Header */}
                <button
                  onClick={() => setExpandedDistrict(expandedDistrict === region ? null : region)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {expandedDistrict === region ? <FolderOpen size={12} className="text-emerald-400 shrink-0" /> : <Folder size={12} className="text-white/40 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-[11px] text-white/80 group-hover:text-white truncate text-left">{region}</div>
                      <div className="text-[9px] text-white/30">{data.farms.length} farm{data.farms.length !== 1 ? 's' : ''} · {data.totalArea.toFixed(0)} ha</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {data.avgYield > 0 && (
                      <span className={`text-[10px] font-mono ${data.avgYield >= 3 ? 'text-emerald-400' : data.avgYield >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {data.avgYield.toFixed(1)} t/ha
                      </span>
                    )}
                    <ChevronRight size={12} className={`text-white/20 transition-transform ${expandedDistrict === region ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* Farm List within Region */}
                {expandedDistrict === region && (
                  <div className="ml-3 border-l border-white/5 pl-2 space-y-0.5 pb-1">
                    {data.farms.map(farm => {
                      const status = getFarmStatus(farm);
                      const yld = getFarmYield(farm);
                      const area = getFarmArea(farm);
                      return (
                        <button
                          key={farm.id}
                          onClick={() => onAction('select-farm', farm)}
                          className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-white/5 transition-all group text-left"
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor(status) }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-white/70 group-hover:text-white truncate">{farm.name || 'Unnamed Farm'}</div>
                            <div className="text-[8px] text-white/25 truncate">
                              {area > 0 ? `${area.toFixed(1)} ha` : ''}
                              {yld > 0 ? ` · ${yld.toFixed(1)} t/ha` : ''}
                              {status !== 'pending' ? ` · ${status}` : ''}
                            </div>
                          </div>
                          <MapPin size={9} className="text-white/20 group-hover:text-emerald-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
};

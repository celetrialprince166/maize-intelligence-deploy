import React, { useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import {
  ArrowRight, Search, Download, Loader2,
  ChevronLeft, MapPin
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { Farm } from '@/app/services/storage';

interface ReportsViewProps {
  onViewDetails: (farm: Farm) => void;
  farms: Farm[];
}

const getFarmAnalysis = (farm: Farm) => {
  const analyses = farm.analyses || {};
  const years = Object.keys(analyses).map(Number).sort((a, b) => b - a);
  const latest = years.length > 0 ? analyses[years[0]] : null;
  return {
    year: years[0] || farm.year || new Date().getFullYear(),
    status: latest?.status || farm.status || 'pending',
    confidence: latest?.confidence || farm.confidence || 0,
    yield: latest?.yield || farm.yield || 0,
    area: latest?.area || farm.area || 0,
    health: (
      (latest?.yield || farm.yield || 0) >= 2.5 ? 'excellent' :
      (latest?.yield || farm.yield || 0) >= 1.5 ? 'good' :
      (latest?.yield || farm.yield || 0) >= 0.8 ? 'moderate' :
      (latest?.yield || farm.yield || 0) > 0 ? 'poor' : null
    ),
    timeSeries: latest?.time_series || [],
    ancillary: latest?.ancillary || null,
  };
};

export const ReportsView: React.FC<ReportsViewProps> = ({ onViewDetails, farms }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const detailRef = useRef<HTMLDivElement>(null);
  const itemsPerPage = 10;

  const handleExportFarmPDF = async (farm: Farm) => {
    if (!detailRef.current) return;
    setIsExporting(true);
    try {
      const imgData = await toPng(detailRef.current, { pixelRatio: 2, backgroundColor: '#0a0a0a', skipFonts: true });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgWidth = 190;
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`${farm.name || farm.id}_report.pdf`);
    } catch (e) { console.error('PDF export failed:', e); }
    finally { setIsExporting(false); }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const headers = ['Farm Name','ID','Classification','Confidence (%)','Crop Health','Yield (t/ha)','Area (ha)','Latitude','Longitude','Season'];
      const rows = farms.map(f => {
        const a = getFarmAnalysis(f);
        return [
          `"${(f.name || '').replace(/"/g, '""')}"`, f.id,
          a.status === 'maize' || a.status === 'verified' ? 'Maize' : a.status === 'non-maize' ? 'Non-Maize' : 'Pending',
          a.confidence > 0 ? (a.confidence * 100).toFixed(1) : '', a.health || '',
          a.yield > 0 ? a.yield.toFixed(2) : '', a.area > 0 ? a.area.toFixed(2) : '',
          f.center ? f.center[0].toFixed(6) : '', f.center ? f.center[1].toFixed(6) : '', a.year.toString(),
        ].join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `maize_farm_reports_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error('CSV export failed:', e); }
    finally { setIsExporting(false); }
  };

  const filteredFarms = useMemo(() => {
    let filtered = farms;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(f => {
        const a = getFarmAnalysis(f);
        if (statusFilter === 'maize') return a.status === 'maize' || a.status === 'verified';
        if (statusFilter === 'non-maize') return a.status === 'non-maize' || a.status === 'rejected';
        if (statusFilter === 'pending') return a.status === 'pending';
        return true;
      });
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(f => (f.name && f.name.toLowerCase().includes(lower)) || f.id.toLowerCase().includes(lower));
    }
    return filtered;
  }, [farms, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredFarms.length / itemsPerPage));
  const paginatedFarms = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFarms.slice(start, start + itemsPerPage);
  }, [filteredFarms, currentPage]);

  const stats = useMemo(() => {
    const analyzed = farms.filter(f => { const a = getFarmAnalysis(f); return a.status !== 'pending'; });
    const maize = farms.filter(f => { const a = getFarmAnalysis(f); return a.status === 'maize' || a.status === 'verified'; });
    const yields = farms.map(f => getFarmAnalysis(f).yield).filter(y => y > 0);
    const avgYield = yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : 0;
    const totalArea = farms.reduce((acc, f) => acc + getFarmAnalysis(f).area, 0);
    return { total: farms.length, analyzed: analyzed.length, maize: maize.length, avgYield, totalArea };
  }, [farms]);

  // --- DETAIL VIEW ---
  if (selectedFarm) {
    const a = getFarmAnalysis(selectedFarm);
    const healthColor = a.health === 'excellent' ? 'text-emerald-400' : a.health === 'good' ? 'text-green-400' : a.health === 'moderate' ? 'text-amber-400' : a.health === 'poor' ? 'text-red-400' : 'text-white/40';
    return (
      <div className="flex flex-col w-full h-full bg-[#0a0a0a] overflow-y-auto scroll-smooth text-white [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div ref={detailRef} className="w-full min-h-full p-4 md:p-8 pt-16 md:pt-24 pb-20 md:pb-48 bg-[#0a0a0a]">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
            <button onClick={() => setSelectedFarm(null)} className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors self-start">
              <ChevronLeft size={16} /> Back to Reports
            </button>
            <div className="flex gap-2">
              <button onClick={() => onViewDetails(selectedFarm)} className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white/70 border border-white/10 transition-colors">
                <MapPin size={14} /> View on Map
              </button>
              <button onClick={() => handleExportFarmPDF(selectedFarm)} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs text-white font-medium shadow-lg shadow-emerald-900/20 transition-colors disabled:opacity-50">
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export PDF
              </button>
            </div>
          </div>
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-white">{selectedFarm.name || 'Farm Report'}</h1>
            <p className="text-white/40 text-sm mt-1">Analysis report for season {a.year} &middot; ID: {selectedFarm.id}</p>
          </div>
          {/* Key Results */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className={`rounded-xl p-5 border ${a.status === 'maize' || a.status === 'verified' ? 'bg-emerald-500/10 border-emerald-500/20' : a.status === 'non-maize' ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
              <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">Classification</div>
              <div className={`text-2xl font-light ${a.status === 'maize' || a.status === 'verified' ? 'text-emerald-400' : a.status === 'non-maize' ? 'text-red-400' : 'text-white/50'}`}>
                {a.status === 'maize' || a.status === 'verified' ? '🌽 Maize' : a.status === 'non-maize' ? '❌ Non-Maize' : '⏳ Pending'}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${a.status === 'maize' || a.status === 'verified' ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${a.confidence * 100}%` }} />
                </div>
                <span className="text-xs text-white/60 font-mono">{a.confidence > 0 ? `${(a.confidence * 100).toFixed(1)}%` : '—'}</span>
              </div>
            </div>
            <div className="rounded-xl p-5 border bg-white/[0.03] border-white/10">
              <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">Crop Health</div>
              <div className={`text-2xl font-light capitalize ${healthColor}`}>{a.health || '— Not analyzed'}</div>
              <div className="mt-2 text-xs text-white/40">Based on yield estimation and NDVI</div>
            </div>
            <div className={`rounded-xl p-5 border ${a.yield > 0 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-white/5 border-white/10'}`}>
              <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">Yield Estimation</div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-light ${a.yield > 0 ? 'text-emerald-400' : 'text-white/40'}`}>{a.yield > 0 ? a.yield.toFixed(2) : '—'}</span>
                <span className="text-sm text-emerald-400/60">t/ha</span>
              </div>
              {a.yield > 0 && a.area > 0 && <div className="mt-2 text-xs text-white/40">Total: ~{(a.yield * a.area).toFixed(1)} tons</div>}
            </div>
          </div>
          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white/5 border border-white/5 p-3 rounded-lg"><div className="text-[9px] text-white/40 uppercase">Area</div><div className="text-lg font-light text-white">{a.area > 0 ? `${a.area.toFixed(1)} ha` : '—'}</div></div>
            <div className="bg-white/5 border border-white/5 p-3 rounded-lg"><div className="text-[9px] text-white/40 uppercase">Location</div><div className="text-sm font-light text-white">{selectedFarm.center ? `${selectedFarm.center[0].toFixed(4)}, ${selectedFarm.center[1].toFixed(4)}` : '—'}</div></div>
            <div className="bg-white/5 border border-white/5 p-3 rounded-lg"><div className="text-[9px] text-white/40 uppercase">Season</div><div className="text-lg font-light text-white">{a.year}</div></div>
            <div className="bg-white/5 border border-white/5 p-3 rounded-lg"><div className="text-[9px] text-white/40 uppercase">Confidence</div><div className="text-lg font-light text-white">{a.confidence > 0 ? `${(a.confidence * 100).toFixed(1)}%` : '—'}</div></div>
          </div>
          {/* Time-Series */}
          {a.timeSeries.length >= 2 && (
            <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl mb-6">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">NDVI Time-Series ({a.year})</h3>
              <p className="text-xs text-white/40 mb-4">Vegetation index trends from Sentinel-2</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={a.timeSeries.filter((t: any) => t.ndvi != null)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="date" stroke="#ffffff40" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} domain={[0, 1]} />
                    <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" dataKey="ndvi" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="NDVI" />
                    <Line type="monotone" dataKey="evi" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} name="EVI" />
                    <Line type="monotone" dataKey="ndmi" stroke="#06b6d4" strokeWidth={1.5} dot={{ r: 2 }} name="NDMI" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {/* Environmental */}
          {a.ancillary && (
            <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl mb-6">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-4">Environmental Context</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Elevation', value: `${a.ancillary.elevation?.toFixed(0)} m`, icon: '⛰️' },
                  { label: 'Slope', value: `${a.ancillary.slope?.toFixed(1)}%`, icon: '📐' },
                  { label: 'Rainfall', value: `${a.ancillary.precip?.toFixed(0)} mm`, icon: '🌧️' },
                  { label: 'Max Temp', value: `${a.ancillary.temp_max?.toFixed(1)} °C`, icon: '🌡️' },
                  { label: 'Soil OC', value: `${a.ancillary.SOC?.toFixed(1)} g/kg`, icon: '🪨' },
                ].map(item => (
                  <div key={item.label} className="bg-white/5 rounded-lg p-3 border border-white/5 text-center">
                    <div className="text-lg mb-1">{item.icon}</div>
                    <div className="text-xs text-white/80 font-mono">{item.value}</div>
                    <div className="text-[9px] text-white/40 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Methodology */}
          <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl">
            <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-3">Analysis Methodology</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5"><div className="text-white/40 text-[9px] uppercase mb-1">Satellite Source</div><div className="text-white/80">Sentinel-2 L2A (Harmonized) &middot; 10m resolution</div></div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5"><div className="text-white/40 text-[9px] uppercase mb-1">Classification Model</div><div className="text-white/80">Random Forest (100 trees) &middot; 87.7% accuracy</div></div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5"><div className="text-white/40 text-[9px] uppercase mb-1">Yield Model</div><div className="text-white/80">Random Forest (500 trees) &middot; R&sup2; = -0.23</div></div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5"><div className="text-white/40 text-[9px] uppercase mb-1">Processing Engine</div><div className="text-white/80">Google Earth Engine &middot; Cloud-based</div></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="flex flex-col w-full h-full bg-[#0a0a0a] overflow-y-auto scroll-smooth text-white [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <div className="w-full min-h-full p-4 md:p-8 pt-16 md:pt-24 pb-20 md:pb-48 bg-[#0a0a0a]">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6 md:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-white mb-1">Farm Reports</h1>
            <p className="text-white/40 text-sm">Analysis reports for all monitored farms. Click a farm to view its full report.</p>
          </div>
          <button onClick={handleExportCSV} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white font-medium shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50">
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export All (CSV)
          </button>
        </div>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl"><div className="text-[9px] text-white/40 uppercase">Total Farms</div><div className="text-xl font-light text-white">{stats.total}</div></div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl"><div className="text-[9px] text-white/40 uppercase">Analyzed</div><div className="text-xl font-light text-white">{stats.analyzed}</div></div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl"><div className="text-[9px] text-emerald-400/60 uppercase">Maize Detected</div><div className="text-xl font-light text-emerald-400">{stats.maize}</div></div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl"><div className="text-[9px] text-white/40 uppercase">Avg Yield</div><div className="text-xl font-light text-white">{stats.avgYield > 0 ? `${stats.avgYield.toFixed(1)} t/ha` : '—'}</div></div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl"><div className="text-[9px] text-white/40 uppercase">Total Area</div><div className="text-xl font-light text-white">{stats.totalArea > 0 ? `${stats.totalArea.toFixed(0)} ha` : '—'}</div></div>
        </div>
        {/* Table */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl md:rounded-2xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div><h3 className="text-sm uppercase tracking-wider font-medium text-white mb-1">Farm Analysis Reports</h3><p className="text-xs text-white/40">{filteredFarms.length} farm{filteredFarms.length !== 1 ? 's' : ''}</p></div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="text" placeholder="Search farms..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="w-full bg-black/50 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer">
                <option value="all">All Status</option>
                <option value="maize">Maize</option>
                <option value="non-maize">Non-Maize</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-white/40">
                  <th className="p-4 md:p-5 font-medium">Farm</th>
                  <th className="p-4 md:p-5 font-medium">Classification</th>
                  <th className="p-4 md:p-5 font-medium">Health</th>
                  <th className="p-4 md:p-5 font-medium text-right">Yield</th>
                  <th className="p-4 md:p-5 font-medium text-right">Area</th>
                  <th className="p-4 md:p-5 font-medium text-right">Confidence</th>
                  <th className="p-4 md:p-5 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence>
                  {paginatedFarms.map((farm) => {
                    const a = getFarmAnalysis(farm);
                    const isMaize = a.status === 'maize' || a.status === 'verified';
                    const isNonMaize = a.status === 'non-maize' || a.status === 'rejected';
                    return (
                      <motion.tr key={farm.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="hover:bg-white/[0.03] transition-colors group cursor-pointer" onClick={() => setSelectedFarm(farm)}>
                        <td className="p-4 md:p-5"><div className="font-medium text-white group-hover:text-emerald-300 transition-colors">{farm.name || 'Unnamed Farm'}</div><div className="text-[9px] text-white/30 font-mono mt-0.5">{farm.id.slice(0, 16)}</div></td>
                        <td className="p-4 md:p-5"><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${isMaize ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : isNonMaize ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/5 text-white/50 border-white/10'}`}><div className={`w-1.5 h-1.5 rounded-full ${isMaize ? 'bg-emerald-500' : isNonMaize ? 'bg-red-500' : 'bg-white/30'}`} />{isMaize ? 'Maize' : isNonMaize ? 'Non-Maize' : 'Pending'}</span></td>
                        <td className="p-4 md:p-5"><span className={`text-xs capitalize ${a.health === 'excellent' ? 'text-emerald-400' : a.health === 'good' ? 'text-green-400' : a.health === 'moderate' ? 'text-amber-400' : a.health === 'poor' ? 'text-red-400' : 'text-white/30'}`}>{a.health || '—'}</span></td>
                        <td className="p-4 md:p-5 text-right font-mono text-white/80">{a.yield > 0 ? a.yield.toFixed(2) : '—'}</td>
                        <td className="p-4 md:p-5 text-right font-mono text-white/60">{a.area > 0 ? a.area.toFixed(1) : '—'}</td>
                        <td className="p-4 md:p-5 text-right font-mono text-white/60">{a.confidence > 0 ? `${(a.confidence * 100).toFixed(0)}%` : '—'}</td>
                        <td className="p-4 md:p-5 text-right"><button className="text-white/30 group-hover:text-emerald-400 transition-colors"><ArrowRight size={16} /></button></td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
                {paginatedFarms.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-white/40 text-sm">No farms match your search criteria.</td></tr>)}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-white/40">Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredFarms.length)} of {filteredFarms.length}</span>
              <div className="flex items-center gap-1">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
                <div className="px-3 py-1.5 text-white/60">{currentPage} / {totalPages}</div>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

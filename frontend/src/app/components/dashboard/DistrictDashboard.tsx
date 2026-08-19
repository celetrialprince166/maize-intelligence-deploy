import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { motion } from 'motion/react';
import { CloudRain, TrendingUp, Users, MapPin, Download, Droplets, AlertTriangle } from 'lucide-react';

interface DistrictDashboardProps {
  data: any;
  onAction: (action: string, payload?: any) => void;
}

const defaultYieldHistory = [
  { year: '2021', yield: 0 },
  { year: '2022', yield: 0 },
  { year: '2023', yield: 0 },
];

export const DistrictDashboard: React.FC<DistrictDashboardProps> = ({ data, onAction }) => {
  const districtName = data?.name || 'Unknown District';
  const districtId = data?.id || 'N/A';
  const avgYield = data?.avgYield ?? 0;
  const totalArea = data?.totalArea ?? 0;
  const farmCount = data?.farmCount ?? 0;
  const [showChart, setShowChart] = useState(false);

  // Build yield history from analyses if available
  const chartData = useMemo(() => {
    if (data?.yieldHistory && data.yieldHistory.length > 0) return data.yieldHistory;
    return defaultYieldHistory;
  }, [data]);

  // Determine region from district name
  const getRegion = () => {
    if (!districtName) return 'Ghana';
    if (['Tamale', 'Nanton', 'Gushegu'].some(d => districtName.includes(d))) return 'Northern Region';
    if (districtName.includes('Accra')) return 'Greater Accra Region';
    if (districtName.includes('Ashanti') || districtName.includes('Bono')) return 'Ashanti / Bono Region';
    return 'Ghana';
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowChart(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-full text-white font-sans space-y-3">
      
      {/* 1. Header & Context */}
      <div className="flex justify-between items-start">
        <div>
           <div className="text-[9px] uppercase tracking-widest text-white/40 font-semibold mb-0.5">{getRegion()}</div>
           <h2 className="text-sm font-medium text-white tracking-tight">{districtName}</h2>
           <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded border border-white/5">{districtId}</span>
           </div>
        </div>
        <button className="bg-white/5 hover:bg-white/10 p-1.5 rounded-lg border border-white/5 transition-colors" title="Download Report">
           <Download size={12} className="text-white/60" />
        </button>
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Avg Yield" value={avgYield > 0 ? avgYield.toFixed(1) : '—'} unit="t/ha" />
        <StatCard label="Area" value={totalArea > 0 ? `${totalArea.toFixed(0)}` : '—'} unit="ha" />
        <StatCard label="Farms" value={farmCount > 0 ? `${farmCount}` : '—'} unit="" />
      </div>

      {/* 3. Yield Trend Chart & Risk (Side-by-side) */}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <div className="flex flex-col space-y-1.5">
          <div className="flex items-center justify-between">
             <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Yield (3yr)</label>
             <span className="text-[8px] text-white/40">Regional avg</span>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg border border-white/5 p-1.5 min-h-[60px]">
             {showChart ? (
               <ResponsiveContainer width="100%" height="100%" minHeight={50} minWidth={100}>
                 <AreaChart data={chartData}>
                   <defs key="defs">
                     <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <RechartsTooltip 
                     key="tooltip"
                     contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '4px', fontSize: '10px', padding: '4px' }}
                     itemStyle={{ color: '#fff' }}
                     cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                   />
                   <Area key="area" type="monotone" dataKey="yield" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorYield)" />
                 </AreaChart>
               </ResponsiveContainer>
             ) : (
               <div className="flex items-center justify-center h-full text-white/20 text-[10px]">
                 Loading...
               </div>
             )}
          </div>
        </div>

        <div className="flex flex-col space-y-1.5">
           <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Details</label>
           <div className="flex flex-col gap-1.5 flex-1">
              <RiskCard 
                icon={<Droplets size={10} className="text-blue-400" />} 
                label="Farms" 
                value={`${farmCount}`} 
                color="bg-blue-500/10 border-blue-500/20"
              />
              <RiskCard 
                icon={<AlertTriangle size={10} className="text-yellow-400" />} 
                label="Area" 
                value={`${totalArea.toFixed(0)} ha`} 
                color="bg-yellow-500/10 border-yellow-500/20"
              />
           </div>
        </div>
      </div>

      {/* 4. Top Performing EPAs */}
      <div className="space-y-1.5 pt-2 border-t border-white/5">
        <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider">District Info</label>
        <div className="space-y-0.5">
           <EpaRow rank="•" name={`Region: ${getRegion()}`} yield="" />
           <EpaRow rank="•" name={`Farms analyzed: ${farmCount}`} yield="" />
           <EpaRow rank="•" name={avgYield > 0 ? `Avg yield: ${avgYield.toFixed(2)} t/ha` : 'No yield data yet'} yield="" />
        </div>
      </div>

    </div>
  );
};

const StatCard = ({ label, value, unit, trend }: any) => (
  <div className="bg-white/5 p-2 rounded-lg border border-white/5 overflow-hidden">
     <div className="text-[8px] text-white/40 uppercase mb-0.5 truncate">{label}</div>
     <div className="flex items-baseline gap-0.5">
        <span className="text-sm font-medium text-white tracking-tight truncate">{value}</span>
        <span className="text-[8px] text-white/30">{unit}</span>
     </div>
     {trend && <div className="text-[8px] text-emerald-400 mt-0.5">{trend}</div>}
  </div>
);

const RiskCard = ({ icon, label, value, color }: any) => (
  <div className={`p-1.5 rounded-lg border ${color} flex items-center justify-between flex-1`}>
     <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[9px] text-white/50 uppercase">{label}</span>
     </div>
     <div className="text-[10px] font-medium text-white">{value}</div>
  </div>
);

const EpaRow = ({ rank, name, yield: val }: any) => (
  <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 transition-colors group">
     <div className="flex items-center gap-2 overflow-hidden">
        <span className="text-[9px] font-mono text-white/30 w-3 text-center shrink-0">{rank}</span>
        <span className="text-[11px] text-white/80 group-hover:text-white truncate">{name}</span>
     </div>
     <div className="text-[10px] text-emerald-400 font-mono shrink-0">{val} <span className="text-white/20">t/ha</span></div>
  </div>
);

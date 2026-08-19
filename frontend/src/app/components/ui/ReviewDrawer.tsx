import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Edit2, RotateCcw, MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';

interface ReviewDrawerProps {
  isOpen: boolean;
  data: { geoJson: any; area: number; points: number } | null;
  activeSeason?: number;
  onSeasonChange?: (year: number) => void;
  onConfirm: (farmName?: string) => void;
  onEdit: () => void;
  onRedraw: () => void;
  onCancel: () => void;
}

function getRegionFromPoints(points: { lat: number; lng: number }[]): string {
  if (!points || points.length === 0) return 'Unknown Location';
  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const avgLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  if (avgLat >= 9.0 && avgLat <= 11.0 && avgLng >= -1.5 && avgLng <= 0.5) return 'Northern Region, Ghana';
  if (avgLat >= 5.4 && avgLat <= 6.2 && avgLng >= -0.5 && avgLng <= 0.5) return 'Greater Accra Region, Ghana';
  if (avgLat >= 7.5 && avgLat <= 9.0) return 'Bono / Ashanti Region, Ghana';
  if (avgLat >= 6.0 && avgLat <= 7.5 && avgLng >= -2.5 && avgLng <= -0.5) return 'Central / Western Region, Ghana';
  if (avgLat >= 6.0 && avgLat <= 8.0 && avgLng >= -0.5 && avgLng <= 1.5) return 'Volta / Eastern Region, Ghana';
  if (avgLat >= 10.0 && avgLat <= 11.5) return 'Upper East / Upper West, Ghana';
  if (avgLat >= 4.5 && avgLat <= 12.0 && avgLng >= -4.0 && avgLng <= 2.0) return 'Ghana';
  return `${avgLat.toFixed(3)}°N, ${Math.abs(avgLng).toFixed(3)}°${avgLng < 0 ? 'W' : 'E'}`;
}

export const ReviewDrawer: React.FC<ReviewDrawerProps> = ({ 
  isOpen, 
  data,
  activeSeason = 2023,
  onSeasonChange,
  onConfirm, 
  onEdit, 
  onRedraw, 
  onCancel 
}) => {
  const handleSeasonChange = (val: string) => {
    const year = Number(val);
    if (onSeasonChange) onSeasonChange(year);
  };

  const [farmName, setFarmName] = useState('');

  const detectedLocation = useMemo(() => {
    if (!data?.geoJson) return 'Unknown Location';
    const points = Array.isArray(data.geoJson) ? data.geoJson : [];
    return getRegionFromPoints(points);
  }, [data]);

  // Only show years with training data
  const seasonOptions = [
    { value: '2021', label: '2021 Growing Season (Jun–Oct)' },
    { value: '2022', label: '2022 Growing Season (Jun–Oct)' },
    { value: '2023', label: '2023 Growing Season (Jun–Oct)' },
  ];
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute top-14 right-0 h-[calc(100%-3.5rem)] w-80 bg-black/90 backdrop-blur-xl border-l border-white/10 z-40 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5">
            <h2 className="text-lg font-semibold text-white">Review Boundary</h2>
            <p className="text-white/40 text-xs mt-1">Verify details before analysis.</p>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            
            {/* Polygon Preview */}
            <div className="aspect-video w-full bg-[#0a1a0a] rounded-lg border border-white/10 overflow-hidden relative">
              {data?.geoJson && Array.isArray(data.geoJson) && data.geoJson.length >= 3 ? (
                <svg viewBox="-10 -10 120 120" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  {(() => {
                    const pts = data.geoJson;
                    const lats = pts.map((p: any) => p.lat);
                    const lngs = pts.map((p: any) => p.lng);
                    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
                    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
                    const rangeLat = maxLat - minLat || 0.001;
                    const rangeLng = maxLng - minLng || 0.001;
                    const svgPoints = pts.map((p: any) =>
                      `${((p.lng - minLng) / rangeLng) * 100},${(1 - (p.lat - minLat) / rangeLat) * 100}`
                    ).join(' ');
                    return (
                      <>
                        <polygon points={svgPoints} fill="rgba(16,185,129,0.2)" stroke="#10b981" strokeWidth="2" />
                        {pts.map((p: any, i: number) => {
                          const x = ((p.lng - minLng) / rangeLng) * 100;
                          const y = (1 - (p.lat - minLat) / rangeLat) * 100;
                          return <circle key={i} cx={x} cy={y} r="3" fill="#10b981" />;
                        })}
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <MapPin className="text-emerald-500/30" size={24} />
                </div>
              )}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <div className="text-[10px] text-white/40 uppercase mb-1">Area</div>
                <div className="text-xl font-light text-white">{data?.area.toFixed(2)} <span className="text-sm text-white/30">ha</span></div>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <div className="text-[10px] text-white/40 uppercase mb-1">Vertices</div>
                <div className="text-xl font-light text-white">{data?.points}</div>
              </div>
            </div>

            {/* Farm Name */}
            <div className="space-y-1">
               <label className="text-xs text-white/40 font-medium uppercase">Farm Name</label>
               <input
                 type="text"
                 value={farmName}
                 onChange={(e) => setFarmName(e.target.value)}
                 placeholder="Enter a name for this farm..."
                 className="w-full p-3 bg-white/5 rounded border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
               />
            </div>

            {/* Location (derived from polygon coordinates) */}
            <div className="space-y-1">
               <label className="text-xs text-white/40 font-medium uppercase">Detected Location</label>
               <div className="p-3 bg-white/5 rounded border border-white/10 text-white text-sm">
                  {detectedLocation}
               </div>
            </div>

            {/* Season */}
            <div className="space-y-1">
               <label className="text-xs text-white/40 font-medium uppercase">Season</label>
               <Select value={String(activeSeason)} onValueChange={handleSeasonChange}>
                 <SelectTrigger className="w-full bg-black border-white/20 text-white hover:bg-white/5 focus:ring-emerald-500/50">
                   <SelectValue placeholder="Select season" />
                 </SelectTrigger>
                 <SelectContent className="bg-[#111] border-white/10 text-white">
                   {seasonOptions.map(opt => (
                     <SelectItem key={opt.value} value={opt.value} className="focus:bg-white/10 focus:text-white cursor-pointer">{opt.label}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
            </div>

          </div>

          {/* Actions */}
          <div className="p-6 border-t border-white/5 space-y-3 bg-black/20">
            <button 
              onClick={() => onConfirm(farmName.trim() || undefined)}
              className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-all shadow-lg shadow-green-900/20 flex items-center justify-center gap-2"
            >
              <Check size={16} /> Confirm & Analyze
            </button>

            <div className="grid grid-cols-2 gap-3">
               <button onClick={onRedraw} className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors flex items-center justify-center gap-2">
                 <RotateCcw size={14} /> Redraw
               </button>
               <button onClick={onCancel} className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors flex items-center justify-center gap-2">
                 <X size={14} /> Discard
               </button>
            </div>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
};

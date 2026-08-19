import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sliders, Globe, Sun, Minus, Maximize2, Eye, EyeOff, LocateFixed, Trash2 } from 'lucide-react';
import type { Farm } from '@/app/services/storage';

export type MapStyle = 'dark' | 'satellite' | 'light' | 'google-embed';

interface ToolsPanelProps {
  activeLayers: string[];
  onToggleLayer: (id: string) => void;
  mapStyle: MapStyle;
  onMapStyleChange: (style: MapStyle) => void;
  isOpen?: boolean;
  onClose?: () => void;
  farms?: Farm[];
  onRecenter?: () => void;
  onClearWorkspace?: () => void;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  activeLayers, onToggleLayer, mapStyle, onMapStyleChange,
  isOpen = false, onClose, farms = [], onRecenter, onClearWorkspace,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const statusLayers = [
    { id: 'show-maize', label: 'Maize Confirmed', color: '#22c55e', statuses: ['maize', 'verified'] },
    { id: 'show-non-maize', label: 'Non-Maize', color: '#ef4444', statuses: ['non-maize', 'rejected'] },
    { id: 'show-pending', label: 'Pending', color: '#6b7280', statuses: ['pending'] },
    { id: 'show-flagged', label: 'Flagged', color: '#f97316', statuses: ['flagged'] },
    { id: 'boundaries', label: 'District Boundaries', color: '#8b5cf6', statuses: [] },
  ];

  function renderContent() {
    return (
      <>
        {/* Base Map */}
        <div>
          <div className="flex items-center gap-2 text-white/50 text-xs uppercase font-bold tracking-wider mb-3">
            <Globe size={12} /> Base Map
          </div>
          <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-lg">
            <MapStyleBtn active={mapStyle === 'satellite'} onClick={() => onMapStyleChange('satellite')} icon={<Globe size={14} />} label="Satellite" />
            <MapStyleBtn active={mapStyle === 'light'} onClick={() => onMapStyleChange('light')} icon={<Sun size={14} />} label="Map" />
          </div>
        </div>

        <div className="h-px bg-white/5 w-full" />

        {/* Layer Visibility */}
        <div>
          <div className="flex items-center gap-2 text-white/50 text-xs uppercase font-bold tracking-wider mb-3">
            <Sliders size={12} /> Layer(s)
          </div>
          <div className="space-y-1.5">
            {statusLayers.map(layer => {
              const isActive = activeLayers.includes(layer.id);
              const count = farms.filter(f => layer.statuses.includes(f.status)).length;
              return (
                <button
                  key={layer.id}
                  onClick={() => onToggleLayer(layer.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg transition-all text-left ${
                    isActive ? 'bg-white/10 border border-white/10' : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isActive ? <Eye size={12} className="text-white/70" /> : <EyeOff size={12} className="text-white/30" />}
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: layer.color, opacity: isActive ? 1 : 0.3 }} />
                    <span className={`text-xs ${isActive ? 'text-white/90' : 'text-white/40'}`}>{layer.label}</span>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        {(onRecenter || onClearWorkspace) && (
          <>
            <div className="h-px bg-white/5 w-full" />
            <div className="space-y-1.5">
              {onRecenter && (
                <button onClick={onRecenter} className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-left">
                  <LocateFixed size={12} className="text-emerald-400" />
                  <span className="text-xs text-white/70">Re-center Map</span>
                </button>
              )}
              {onClearWorkspace && (
                <button onClick={onClearWorkspace} className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-red-500/10 transition-all text-left">
                  <Trash2 size={12} className="text-red-400/60" />
                  <span className="text-xs text-white/50">Clear Workspace</span>
                </button>
              )}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {isOpen && <div onClick={onClose} className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" />}

      <motion.div
        drag dragMomentum={false} dragElastic={0.1}
        className="z-40 hidden md:flex flex-col bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden absolute top-20 right-6 w-56 pointer-events-auto cursor-grab active:cursor-grabbing"
        style={{ maxHeight: isMinimized ? 'auto' : 'calc(100vh - 120px)' }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5 shrink-0 select-none">
          <div className="flex items-center gap-2">
            <div className="flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-white/20" /><div className="w-1.5 h-1.5 rounded-full bg-white/20" /></div>
            <span className="text-white/50 text-xs uppercase font-bold tracking-wider">Map Controls</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
            {isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
          </button>
        </div>
        <AnimatePresence>
          {!isMinimized && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="flex flex-col gap-5 p-4"
            >
              {renderContent()}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className={`z-50 flex flex-col gap-5 p-4 bg-black/90 backdrop-blur-xl border-t border-white/10 shadow-2xl overflow-y-auto md:hidden fixed inset-x-0 bottom-0 rounded-t-2xl h-[40vh] pb-24 transition-transform duration-300 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-2" />
        {renderContent()}
      </div>
    </>
  );
};

const MapStyleBtn = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 py-2 rounded-md transition-all ${active ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
    {icon}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

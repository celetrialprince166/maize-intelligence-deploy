import React from 'react';
import { Undo2, Redo2, X, Check, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DrawingHUDProps {
  isVisible: boolean;
  mode?: 'draw' | 'edit';
  pointsCount: number;
  area: number; // in hectares
  onUndo: () => void;
  onRedo: () => void;
  canRedo?: boolean;
  onCancel: () => void;
  onFinish: () => void;
}

export const DrawingHUD: React.FC<DrawingHUDProps> = ({ 
  isVisible, 
  mode = 'draw',
  pointsCount, 
  area, 
  onUndo, 
  onRedo, 
  canRedo = false,
  onCancel, 
  onFinish 
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full py-2 px-4 shadow-2xl shadow-black/50"
        >
          {/* Stats */}
          <div className="flex items-center gap-4 pr-4 border-r border-white/10 mr-1">
            <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] text-white/40 uppercase font-medium">Points</span>
              <span className="text-sm font-mono text-white font-medium">{pointsCount}</span>
            </div>
            <div className="flex flex-col items-start leading-none min-w-[60px]">
              <span className="text-[10px] text-white/40 uppercase font-medium">Area</span>
              <span className="text-sm font-mono text-emerald-400 font-medium">{area > 0 ? area.toFixed(2) : '0.00'} <span className="text-[10px] text-emerald-600">ha</span></span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <IconButton icon={<Undo2 size={16} />} onClick={onUndo} tooltip="Undo" disabled={pointsCount === 0} />
            <IconButton icon={<Redo2 size={16} />} onClick={onRedo} tooltip="Redo" disabled={!canRedo} />
            
            <div className="w-px h-6 bg-white/10 mx-1"></div>
            
            <button 
              onClick={onCancel}
              className="p-2 rounded-full text-red-400 hover:bg-red-500/20 transition-colors"
              title={mode === 'edit' ? "Discard Changes" : "Cancel Drawing"}
            >
              <X size={18} />
            </button>

            <button 
              onClick={onFinish}
              disabled={pointsCount < 3}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all
                ${pointsCount >= 3 
                  ? 'bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10 scale-100' 
                  : 'bg-white/10 text-white/20 cursor-not-allowed scale-95'}
              `}
            >
              {mode === 'edit' ? <Save size={14} /> : <Check size={14} />}
              {mode === 'edit' ? 'Save' : 'Finish'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const IconButton = ({ icon, onClick, disabled }: any) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`p-2 rounded-full transition-colors ${disabled ? 'text-white/10 cursor-not-allowed' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
  >
    {icon}
  </button>
);

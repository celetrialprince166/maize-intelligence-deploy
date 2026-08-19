import React, { useState } from 'react';
import { Plus, PenTool, UploadCloud, X, LocateFixed } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MapActionsProps {
  onStartDrawing: () => void;
  onUploadClick: () => void;
  onRecenter?: () => void;
}

export const MapActions: React.FC<MapActionsProps> = ({ onStartDrawing, onUploadClick, onRecenter }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute bottom-28 right-6 md:bottom-8 md:right-72 z-40 flex flex-col items-end gap-3">
      {/* Re-center button */}
      {onRecenter && (
        <motion.button
          onClick={onRecenter}
          whileTap={{ scale: 0.9 }}
          className="w-10 h-10 rounded-full bg-black/70 backdrop-blur border border-white/10 text-white/60 hover:text-white hover:bg-black/90 shadow-lg flex items-center justify-center transition-colors"
          aria-label="Re-center to last farm"
          title="Re-center to last farm"
        >
          <LocateFixed size={18} />
        </motion.button>
      )}

      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.button
              key="draw"
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ delay: 0.05 }}
              onClick={() => { onStartDrawing(); setIsExpanded(false); }}
              className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-full bg-white text-black font-medium text-sm shadow-lg shadow-black/30 hover:bg-gray-100 transition-colors"
            >
              <PenTool size={16} />
              Draw Boundary
            </motion.button>
            <motion.button
              key="upload"
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              onClick={() => { onUploadClick(); setIsExpanded(false); }}
              className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-full bg-emerald-600 text-white font-medium text-sm shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 transition-colors"
            >
              <UploadCloud size={16} />
              Upload File
            </motion.button>
          </>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        animate={{ rotate: isExpanded ? 45 : 0 }}
        transition={{ duration: 0.2 }}
        className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 flex items-center justify-center transition-colors"
        aria-label={isExpanded ? 'Close actions' : 'Add farm data'}
      >
        <Plus size={24} />
      </motion.button>
    </div>
  );
};

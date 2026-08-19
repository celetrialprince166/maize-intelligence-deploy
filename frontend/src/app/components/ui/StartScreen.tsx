import React from 'react';
import { UploadCloud, PenTool } from 'lucide-react';
import maizeIcon from '@/assets/maize-icon.png';
import { motion } from 'motion/react';

interface StartScreenProps {
  onSelectUpload: () => void;
  onSelectDraw: () => void;
  onSkip: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({ onSelectUpload, onSelectDraw, onSkip }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-black to-black">
      
      {/* Background Mesh/Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-700/10 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center mb-12"
      >
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
          <img src={maizeIcon} alt="Maize" className="w-12 h-12 object-contain" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Maize Intelligence System</h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto font-light">
          Upload farm boundaries or draw on the map to analyze maize crops, verify classification, and predict farm yield with spatial intelligence.
        </p>
      </motion.div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        <motion.button
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectUpload}
          className="group relative flex flex-col items-center text-center p-10 bg-[#111] border border-white/10 rounded-3xl hover:border-emerald-500/50 transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 rounded-2xl bg-white/5 group-hover:bg-emerald-500/10 flex items-center justify-center mb-6 text-white/40 group-hover:text-emerald-500 transition-colors">
            <UploadCloud size={32} />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-3">Upload Farm Data</h2>
          <p className="text-white/40 text-sm leading-relaxed">
            Upload farm boundaries or a large area of interest. Supports GeoJSON, KML, Shapefile, and CSV formats.
          </p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectDraw}
          className="group relative flex flex-col items-center text-center p-10 bg-[#111] border border-white/10 rounded-3xl hover:border-emerald-500/50 transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 rounded-2xl bg-white/5 group-hover:bg-emerald-500/10 flex items-center justify-center mb-6 text-white/40 group-hover:text-emerald-500 transition-colors">
            <PenTool size={32} />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-3">Draw on Map</h2>
          <p className="text-white/40 text-sm leading-relaxed">
            Interactively draw farm polygons or scan regions directly on the high-resolution satellite map workspace.
          </p>
        </motion.button>
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={onSkip}
        className="relative z-10 mt-12 px-6 py-2 text-white/40 hover:text-white transition-colors text-sm tracking-wide"
      >
        Skip and explore map →
      </motion.button>
    </div>
  );
};

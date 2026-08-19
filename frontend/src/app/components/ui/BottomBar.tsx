import React from 'react';
import { Calendar } from 'lucide-react';

interface BottomBarProps {
  activeSeason: number;
  onSeasonChange: (year: number) => void;
}

// Training data covers 2021-2023 growing seasons (Jun-Oct)
const seasons = [2021, 2022, 2023];

export const BottomBar: React.FC<BottomBarProps> = ({ activeSeason, onSeasonChange }) => {
  return (
    <div className="absolute bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-40 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full py-2 px-4 md:px-6 shadow-2xl flex items-center gap-3 md:gap-4 w-max max-w-[90vw]">
      
      <div className="flex items-center gap-1.5 text-white/40 shrink-0">
        <Calendar size={12} />
        <span className="text-[10px] uppercase tracking-wider font-medium">Season</span>
      </div>

      <div className="w-px h-5 bg-white/10" />

      <div className="flex items-center gap-1">
        {seasons.map((year, index) => (
          <div key={year} className="flex items-center gap-1">
            <button 
              onClick={() => onSeasonChange(year)}
              className={`relative px-4 py-1 text-sm font-medium transition-all duration-300
                ${activeSeason === year 
                  ? 'text-black' 
                  : 'text-white/40 hover:text-white'}
              `}
            >
              {activeSeason === year && (
                <div className="absolute inset-0 bg-white rounded-full -z-10 shadow-lg shadow-white/20" />
              )}
              {year}
            </button>
            {index < seasons.length - 1 && (
              <div className="w-3 h-px bg-white/10" />
            )}
          </div>
        ))}
      </div>

      <div className="w-px h-5 bg-white/10" />

      <span className="text-[9px] text-white/30 shrink-0">Jun–Oct</span>
    </div>
  );
};

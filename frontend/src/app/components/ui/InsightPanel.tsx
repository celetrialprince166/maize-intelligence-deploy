import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NationalDashboard } from '@/app/components/dashboard/NationalDashboard';
import { DistrictDashboard } from '@/app/components/dashboard/DistrictDashboard';
import { FarmDashboard } from '@/app/components/dashboard/FarmDashboard';
import { AnalysisFlowPanel } from '@/app/components/ui/AnalysisFlowPanel';
import { TrendingUp, Minus, Maximize2, ArrowLeft } from 'lucide-react';
import { District, Farm } from '@/app/services/storage';

// Simple media query hook for responsive logic
function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);
  return matches;
}

interface InsightPanelProps {
  selectionState: 'none' | 'district' | 'farm';
  selectedData: any;
  onAction: (action: string, payload?: any) => void;
  activeTab?: string;
  districts?: District[];
  farms?: Farm[];
  activeSeason?: number;
  analysisFarms?: Farm[];
  onAnalysisComplete?: () => void;
  onAnalysisDismiss?: () => void;
  onDataUpdate?: () => void;
  onFarmRename?: (farmId: string, newName: string) => void;
}

export const InsightPanel: React.FC<InsightPanelProps> = ({ selectionState, selectedData, onAction, activeTab, districts, farms, activeSeason, analysisFarms = [], onAnalysisComplete, onAnalysisDismiss, onDataUpdate, onFarmRename }) => {
  // On mobile, show full-screen dashboard when on 'overview' tab with no selection
  const isMobileDashboardView = activeTab === 'overview' && selectionState === 'none' && analysisFarms.length === 0;
  const isAnalyzing = analysisFarms.length > 0;
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isAnalysisMinimized, setIsAnalysisMinimized] = useState(false);

  return (
    <>
      {/* Desktop Layout - Floating Panel */}
      <div className="
          z-40 hidden md:flex flex-col gap-4 pointer-events-none
          absolute top-20 left-6 w-80
      ">
        <AnimatePresence mode="wait">
          {/* Analysis Flow */}
          {isAnalyzing && isDesktop && (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              drag
              dragMomentum={false}
              dragElastic={0.1}
              className="bg-black/90 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col cursor-grab active:cursor-grabbing"
              style={{ height: isAnalysisMinimized ? 'auto' : '70vh' }}
            >
              {/* Minimize header for analysis panel */}
              <div className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0 select-none border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsAnalysisMinimized(!isAnalysisMinimized); }}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                  aria-label={isAnalysisMinimized ? 'Expand' : 'Minimize'}
                >
                  {isAnalysisMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
                </button>
              </div>
              {!isAnalysisMinimized && (
                <AnalysisFlowPanel 
                  farms={analysisFarms}
                  activeSeason={activeSeason}
                  onComplete={() => onAnalysisComplete && onAnalysisComplete()} 
                  onClose={() => onAnalysisDismiss && onAnalysisDismiss()}
                  onSelectFarm={(farm) => onAction('select-farm', farm)}
                  onDataUpdate={onDataUpdate}
                />
              )}
              {isAnalysisMinimized && (
                <div className="px-4 py-2 text-xs text-emerald-400/70">Maize Analysis Engine — minimized</div>
              )}
            </motion.div>
          )}

          {/* National Dashboard (Desktop) */}
          {!isAnalyzing && selectionState === 'none' && (
            <PanelBase key="national" title="Intelligence Dashboard">
                <NationalDashboard onAction={onAction} districts={districts} farms={farms} activeSeason={activeSeason} />
            </PanelBase>
          )}

          {/* District Analysis */}
          {selectionState === 'district' && (
            <PanelBase key="district" title="" onBack={() => onAction('back-to-overview')}>
              <DistrictDashboard data={selectedData} onAction={onAction} />
            </PanelBase>
          )}

          {/* Farm Detail View */}
          {selectionState === 'farm' && (
            <PanelBase key="farm" title="" onBack={() => onAction('back-to-overview')}>
               <FarmDashboard data={selectedData} onAction={onAction} onRename={onFarmRename} />
            </PanelBase>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Layout */}
      <AnimatePresence mode="wait">
        {/* Mobile: Bottom Sheet for Analysis/District/Farm/National */}
        {(isAnalyzing || selectionState === 'district' || selectionState === 'farm' || isMobileDashboardView) && (
          <motion.div
            key={`mobile-${isAnalyzing ? 'analysis' : isMobileDashboardView ? 'national' : selectionState}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="md:hidden fixed bottom-20 left-0 right-0 z-40 bg-black/95 backdrop-blur-xl border-t border-emerald-500/20 rounded-t-3xl shadow-2xl pointer-events-auto max-h-[80vh] flex flex-col"
          >
            {/* Drag Handle */}
            <div className="sticky top-0 bg-black/80 backdrop-blur-xl z-10 flex justify-center py-2 pb-3 border-b border-white/5 shrink-0 rounded-t-3xl">
              <div className="w-12 h-1 bg-white/20 rounded-full" />
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-6">
              {isAnalyzing && !isDesktop && (
                 <AnalysisFlowPanel 
                    farms={analysisFarms}
                    activeSeason={activeSeason}
                    onComplete={() => onAnalysisComplete && onAnalysisComplete()} 
                    onClose={() => onAnalysisDismiss && onAnalysisDismiss()}
                    onSelectFarm={(farm) => onAction('select-farm', farm)}
                    onDataUpdate={onDataUpdate}
                 />
              )}
              {isMobileDashboardView && !isAnalyzing && (
                <NationalDashboard onAction={onAction} districts={districts} farms={farms} activeSeason={activeSeason} />
              )}
              {!isAnalyzing && selectionState === 'district' && (
                <DistrictDashboard data={selectedData} onAction={onAction} />
              )}
              {!isAnalyzing && selectionState === 'farm' && (
                <FarmDashboard data={selectedData} onAction={onAction} onRename={onFarmRename} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const PanelBase = ({ title, children, onBack }: { title: string, children: React.ReactNode, onBack?: () => void }) => {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      drag
      dragMomentum={false}
      dragElastic={0.1}
      className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl pointer-events-auto flex flex-col cursor-grab active:cursor-grabbing"
      style={{ maxHeight: isMinimized ? 'auto' : '80vh' }}
    >
      {/* Drag handle + back + minimize */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5 shrink-0 select-none">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={(e) => { e.stopPropagation(); onBack(); }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              aria-label="Back to overview"
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          </div>
          {title && <h2 className="text-white text-sm font-semibold tracking-tight">{title}</h2>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
          aria-label={isMinimized ? 'Expand panel' : 'Minimize panel'}
        >
          {isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
        </button>
      </div>
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
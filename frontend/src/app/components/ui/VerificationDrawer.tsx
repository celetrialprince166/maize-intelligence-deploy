import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, AlertTriangle, Ruler, Sprout, MapPin, Layers, WifiOff, Activity } from 'lucide-react';

interface VerificationDrawerProps {
  isOpen: boolean;
  data: any; // The farm data object
  onApprove: () => void;
  onFlag: () => void;
  onReject: () => void;
  onClose: () => void;
  isOffline?: boolean;
}

export const VerificationDrawer: React.FC<VerificationDrawerProps> = ({ 
  isOpen, 
  data, 
  onApprove, 
  onFlag, 
  onReject, 
  onClose,
  isOffline = false
}) => {
  const [notes, setNotes] = useState('');

  // Dynamically derive comparison and anomaly data based on the selected farm
  const yieldVal = data?.yield || 4.5;
  const isHighYieldAnomaly = yieldVal > 6;
  const isLowYieldAnomaly = yieldVal < 2 && yieldVal > 0;
  const confidence = data?.confidence ? Math.round(data.confidence * 100) : 92;
  const isConfidenceAnomaly = confidence < 70;
  
  const hasAnomaly = isHighYieldAnomaly || isLowYieldAnomaly || isConfidenceAnomaly;

  const comparison = {
    claimedArea: data?.area ? (data.area * 1.05).toFixed(2) : '12.50',
    measuredArea: data?.area?.toFixed(2) || '12.42',
    diff: data?.area ? Number((((data.area - (data.area * 1.05)) / (data.area * 1.05)) * 100).toFixed(1)) : -0.64,
    crop: 'Maize',
    confidence: confidence,
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute top-14 right-0 bottom-0 w-96 bg-black/90 backdrop-blur-xl border-l border-white/10 z-40 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {hasAnomaly ? 'Anomaly Investigation' : 'Verify Farm'}
              </h2>
              <p className="text-white/40 text-xs mt-1">ID: {data?.id || 'Unknown'}</p>
            </div>
            <div className={`px-2 py-1 rounded text-xs border ${
              hasAnomaly 
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            }`}>
              {hasAnomaly ? 'Review Required' : 'Pending'}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar">
            
            {/* Anomaly Alerts Section */}
            {hasAnomaly && (
              <div className="space-y-3">
                <label className="text-xs text-amber-400/80 font-bold uppercase tracking-wider flex items-center gap-2">
                  <Activity size={12} /> Detected Anomalies
                </label>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-3">
                  {isHighYieldAnomaly && (
                    <div className="flex gap-3">
                      <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                      <div>
                        <div className="text-sm text-white font-medium mb-1">Suspiciously High Yield</div>
                        <div className="text-xs text-amber-200/70">
                          Reported yield of {yieldVal.toFixed(1)} t/ha exceeds regional maximums. Check for duplicate reporting or multi-crop overlaps.
                        </div>
                      </div>
                    </div>
                  )}
                  {isLowYieldAnomaly && (
                    <div className="flex gap-3">
                      <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                      <div>
                        <div className="text-sm text-white font-medium mb-1">Critical Crop Failure Risk</div>
                        <div className="text-xs text-amber-200/70">
                          Yield estimated at {yieldVal.toFixed(1)} t/ha. High probability of drought stress or pest damage detected in NDVI trends.
                        </div>
                      </div>
                    </div>
                  )}
                  {isConfidenceAnomaly && (
                    <div className="flex gap-3">
                      <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                      <div>
                        <div className="text-sm text-white font-medium mb-1">Low Classification Confidence</div>
                        <div className="text-xs text-amber-200/70">
                          AI is only {confidence}% confident this is Maize. May be intercropped or misclassified.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 1. Satellite Evidence */}
            <div className="space-y-3">
              <label className="text-xs text-white/40 font-bold uppercase tracking-wider flex items-center gap-2">
                <Layers size={12} /> Satellite Evidence
              </label>
              <div className="aspect-video w-full bg-white/5 rounded-lg border border-white/10 relative overflow-hidden group flex items-center justify-center">
                {isOffline ? (
                    <div className="flex flex-col items-center gap-2 text-white/30">
                        <WifiOff size={24} />
                        <span className="text-[10px] uppercase tracking-wide">Image Unavailable Offline</span>
                    </div>
                ) : (
                    <>
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1595248692695-812040b15510?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center opacity-60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 border-2 border-yellow-400 rounded-full flex items-center justify-center bg-black/20 backdrop-blur-sm">
                            <MapPin className="text-yellow-400" size={24} />
                        </div>
                        </div>
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-[10px] text-white/70 backdrop-blur-md">
                        Captured: 24 Oct 2023
                        </div>
                    </>
                )}
              </div>
            </div>

            {/* 2. Data Comparison */}
            <div className="space-y-3">
              <label className="text-xs text-white/40 font-bold uppercase tracking-wider flex items-center gap-2">
                <Ruler size={12} /> Data Comparison
              </label>
              
              <div className="grid grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-lg overflow-hidden">
                <div className="bg-white/5 p-3">
                  <div className="text-[10px] text-white/40 mb-1">Claimed Area</div>
                  <div className="text-lg font-medium text-white">{comparison.claimedArea} ha</div>
                </div>
                <div className="bg-white/5 p-3">
                  <div className="text-[10px] text-white/40 mb-1">Measured Area</div>
                  <div className={`text-lg font-medium ${Math.abs(comparison.diff) > 5 ? 'text-red-400' : 'text-green-400'}`}>
                    {comparison.measuredArea} ha
                  </div>
                </div>
                <div className="col-span-2 bg-white/5 p-2 text-center border-t border-white/5">
                   <span className={`text-xs ${Math.abs(comparison.diff) > 5 ? 'text-red-400' : 'text-green-400'}`}>
                     Difference: {comparison.diff > 0 ? '+' : ''}{comparison.diff}%
                   </span>
                </div>
              </div>
            </div>

            {/* 3. Crop Classification */}
            <div className="space-y-3">
              <label className="text-xs text-white/40 font-bold uppercase tracking-wider flex items-center gap-2">
                <Sprout size={12} /> Classification
              </label>
              
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-medium">Maize</span>
                    <span className="text-green-400 font-bold">{comparison.confidence}%</span>
                 </div>
                 <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full" style={{ width: `${comparison.confidence}%` }} />
                 </div>
                 <p className="text-xs text-white/40 mt-3 leading-relaxed">
                   Spectral signature strongly matches maize phenology for the selected season. Minimal signs of intercropping detected.
                 </p>
              </div>
            </div>

            {/* 4. Notes */}
            <div className="space-y-2">
              <label className="text-xs text-white/40 font-bold uppercase tracking-wider">Verifier Notes</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add observations..."
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-white/30 h-24 resize-none placeholder-white/20"
              />
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-md space-y-3">
            <button 
              onClick={onApprove}
              className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
            >
              <Check size={16} /> Approve Verification
            </button>

            <div className="grid grid-cols-2 gap-3">
               <button 
                 onClick={onFlag}
                 className="py-3 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-500 font-medium text-sm transition-colors flex items-center justify-center gap-2"
               >
                 <AlertTriangle size={16} /> Flag for Visit
               </button>
               <button 
                 onClick={onReject}
                 className="py-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-medium text-sm transition-colors flex items-center justify-center gap-2"
               >
                 <X size={16} /> Reject
               </button>
            </div>
            
            <button onClick={onClose} className="w-full text-center text-xs text-white/30 hover:text-white mt-2">
              Cancel
            </button>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
};

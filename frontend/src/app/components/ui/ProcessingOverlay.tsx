import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, CheckCircle2, Globe, Cpu, ShieldCheck, MapPin, Upload } from 'lucide-react';

interface ProcessingOverlayProps {
  isVisible: boolean;
  onComplete: () => void;
}

const steps = [
  { label: "Uploading geospatial data...", icon: Upload, duration: 1000 },
  { label: "Rectifying coordinates (WGS84)...", icon: MapPin, duration: 1200 },
  { label: "Parsing farm boundaries...", icon: Globe, duration: 1500 },
  { label: "Validating geometries...", icon: ShieldCheck, duration: 800 },
  { label: "Import complete.", icon: CheckCircle2, duration: 600 },
];

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ isVisible, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      return;
    }

    let cancelled = false;
    const runSteps = async () => {
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        setCurrentStep(i + 1);
        await new Promise(r => setTimeout(r, steps[i].duration));
      }
      if (!cancelled) {
        await new Promise(r => setTimeout(r, 500));
        onComplete();
      }
    };
    runSteps();
    return () => { cancelled = true; };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="w-[380px] bg-[#0F0F0F] border border-white/10 rounded-xl p-6 shadow-2xl">
        
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 relative">
            {currentStep < steps.length ? (
              <Loader2 className="animate-spin text-emerald-500" size={24} />
            ) : (
              <CheckCircle2 className="text-emerald-500" size={24} />
            )}
          </div>
          <h3 className="text-lg font-medium text-white">
            {currentStep >= steps.length ? 'Import Complete' : 'Processing Data'}
          </h3>
        </div>

        <div className="space-y-3">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const stepNum = idx + 1;
            const isActive = stepNum === currentStep;
            const isCompleted = stepNum < currentStep;
            const isPending = stepNum > currentStep;

            return (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: isPending ? 0.3 : 1, x: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-300 ${
                  isCompleted ? 'bg-emerald-500 border-emerald-500 text-black' : 
                  isActive ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 
                  'bg-white/5 border-white/10 text-white/20'
                }`}>
                  {isCompleted ? <CheckCircle2 size={12} /> : isActive ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
                </div>
                <div className="flex-1">
                  <div className={`text-sm transition-colors duration-300 ${isCompleted ? 'text-white/60' : isActive ? 'text-white' : 'text-white/30'}`}>
                    {step.label}
                  </div>
                  {isActive && (
                    <motion.div 
                      className="h-0.5 bg-emerald-500 mt-1.5 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: step.duration / 1000, ease: "linear" }}
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

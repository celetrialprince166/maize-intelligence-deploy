import React from 'react';
import { LayoutDashboard, Map as MapIcon, ShieldCheck, FileText, Settings, Layers, BrainCircuit } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavProps {
  activeTab: string;
  onNavChange: (tab: string) => void;
  onToggleLayers?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onNavChange, onToggleLayers }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-white/10 px-6 py-3 pb-6 z-50 md:hidden flex justify-between items-center">
      <NavItem 
        icon={<LayoutDashboard size={20} />} 
        label="Overview" 
        isActive={activeTab === 'overview'} 
        onClick={() => onNavChange('overview')}
      />
      <NavItem 
        icon={<BrainCircuit size={20} />} 
        label="Dashboard" 
        isActive={activeTab === 'dashboard'} 
        onClick={() => onNavChange('dashboard')}
      />
      <NavItem 
        icon={<ShieldCheck size={20} />} 
        label="Verify" 
        isActive={activeTab === 'verification'} 
        onClick={() => onNavChange('verification')}
      />
      
      {/* Central Action Button (Upload or Layers) */}
      <div className="-mt-8">
        <button 
            onClick={onToggleLayers}
            className="w-14 h-14 rounded-full bg-indigo-600 shadow-lg shadow-indigo-900/50 flex items-center justify-center text-white border-4 border-black"
        >
            <Layers size={24} />
        </button>
      </div>

      <NavItem 
        icon={<FileText size={20} />} 
        label="Reports" 
        isActive={activeTab === 'reports'} 
        onClick={() => onNavChange('reports')}
      />
      <NavItem 
        icon={<Settings size={20} />} 
        label="Settings" 
        isActive={activeTab === 'settings'} 
        onClick={() => onNavChange('settings')}
      />
    </div>
  );
};

const NavItem = ({ icon, label, isActive, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-white' : 'text-white/40'}`}
  >
    <div className={`p-1 rounded-lg transition-all ${isActive ? 'bg-white/10' : ''}`}>
        {icon}
    </div>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Bell, PenTool, UploadCloud, ChevronDown, Wifi, WifiOff, BrainCircuit, LayoutDashboard, FileText } from 'lucide-react';
import logoImage from '@/assets/maize-icon.png';
import { NotificationsPanel } from './NotificationsPanel';
import { useNotifications } from '../../contexts/NotificationContext';
import { getStoredUser } from '@/app/services/auth';

interface TopBarProps {
  onUploadClick: () => void;
  onStartDrawing?: () => void;
  activeTab: string;
  onNavChange: (tab: string) => void;
  onSearchSelect: (result: any) => void;
  isOffline?: boolean;
  isSlowConnection?: boolean;
  onToggleOffline?: () => void;
  onMapFocus?: (farmId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ 
    onUploadClick, 
    onStartDrawing,
    activeTab, 
    onNavChange, 
    isOffline = false,
    isSlowConnection = false,
    onToggleOffline,
    onMapFocus
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const { unreadCount } = useNotifications();

  // Close add menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setIsAddMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="absolute top-0 left-0 right-0 h-14 z-[100] flex items-center justify-between px-4 md:px-6 border-b border-white/5 text-white">
      {/* Background layer to prevent backdrop-filter from creating a stacking context for children */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md -z-10" />
      
      {/* Left: Branding */}
      <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => onNavChange('dashboard')}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
           <img src={logoImage} alt="Maize Intelligence Logo" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base md:text-lg tracking-tight text-white/90 leading-tight">
            <span className="hidden sm:inline">Maize Intelligence</span>
            <span className="sm:hidden">MaizeYield</span>
          </span>
          {isOffline && (
            <span className="md:hidden text-[9px] text-red-400 uppercase tracking-wide font-bold flex items-center gap-1">
              <WifiOff size={10} />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Center: Navigation (Desktop Only) */}
      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 bg-black/30 rounded-full p-1 border border-white/5 backdrop-blur-lg">
        {isOffline && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full mr-2">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Offline</span>
            </div>
        )}
        
        <NavButton 
          icon={<LayoutDashboard size={16} />} 
          label="Overview" 
          active={activeTab === 'overview'} 
          onClick={() => onNavChange('overview')}
        />
        <NavButton 
          icon={<BrainCircuit size={16} />} 
          label="Dashboard" 
          active={activeTab === 'dashboard'} 
          onClick={() => onNavChange('dashboard')}
        />
        <NavButton 
          icon={<FileText size={16} />} 
          label="Reports" 
          active={activeTab === 'reports'} 
          onClick={() => onNavChange('reports')}
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        
        {/* Connectivity Toggle */}
        <button 
           onClick={onToggleOffline}
           className={`p-2 rounded-full transition-all duration-300 ${
               isOffline 
               ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 ring-1 ring-red-500/50' 
               : isSlowConnection
               ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 ring-1 ring-yellow-500/50'
               : 'text-emerald-500 hover:bg-emerald-500/10'
           }`}
           title={isOffline ? "System Offline" : isSlowConnection ? "Slow Connection — Background processing active" : "System Online"}
        >
           {isOffline ? <WifiOff size={16} /> : <Wifi size={16} />}
        </button>

        <div className="relative" ref={addMenuRef}>
          <button 
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors shadow-lg shadow-green-900/20"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Add Farm</span>
            <span className="sm:hidden">Add</span>
            <ChevronDown size={12} className={`transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isAddMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
              <button
                onClick={() => { setIsAddMenuOpen(false); onUploadClick(); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left text-white/90 transition-colors border-b border-white/5"
              >
                <UploadCloud size={16} className="text-emerald-500" />
                <div>
                  <div className="text-sm font-medium">Upload File</div>
                  <div className="text-[10px] text-white/40">GeoJSON, Shapefile, KML</div>
                </div>
              </button>
              {onStartDrawing && (
                <button
                  onClick={() => { setIsAddMenuOpen(false); onStartDrawing(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left text-white/90 transition-colors"
                >
                  <PenTool size={16} className="text-emerald-500" />
                  <div>
                    <div className="text-sm font-medium">Draw Boundary</div>
                    <div className="text-[10px] text-white/40">Trace on map</div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-white/10 mx-1 hidden md:block"></div>

        <div className="relative">
          <IconButton 
            icon={
              <div className="relative">
                <Bell size={18} />
                {/* Simulated Unread Badge */}
                {unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-black flex items-center justify-center shadow-[0_0_5px_rgba(34,197,94,0.5)]">
                    <span className="text-[8px] font-bold text-black leading-none">{unreadCount}</span>
                  </div>
                )}
              </div>
            } 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} 
          />
          <NotificationsPanel 
            isOpen={isNotificationsOpen} 
            onClose={() => setIsNotificationsOpen(false)} 
            onMapFocus={onMapFocus}
          />
        </div>
        <div 
          onClick={() => onNavChange('settings')}
          className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-bold cursor-pointer transition-all ${
             activeTab === 'settings' 
             ? 'bg-white text-black border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
             : 'bg-indigo-600 border-white/20 hover:bg-indigo-500'
          }`}
        >
          {(() => {
            const user = getStoredUser();
            if (user?.name) {
              const parts = user.name.trim().split(/\s+/);
              return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
            }
            return '?';
          })()}
        </div>
      </div>
    </div>
  );
};

const NavButton = ({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`
      flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200
      ${active 
        ? 'bg-white/10 text-white shadow-inner border border-white/5' 
        : 'text-white/60 hover:text-white hover:bg-white/5'}
    `}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const IconButton = ({ icon, onClick }: { icon: React.ReactNode, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
  >
    {icon}
  </button>
);
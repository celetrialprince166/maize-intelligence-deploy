import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, User, Bell, Lock, Globe, Database, 
  Smartphone, LogOut, ChevronRight, Check,
  CreditCard, Users, Settings as SettingsIcon,
  UserCircle, X, Map, Camera
} from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { getStoredUser } from '@/app/services/auth';

export type UserRole = 'admin' | 'analyst' | 'viewer';

interface SettingsViewProps {
  userRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  userRole, 
  onRoleChange,
  onLogout 
}) => {
  // Load real user data from auth
  const authUser = getStoredUser();
  const [profile, setProfile] = useState({
    name: authUser?.name || '',
    email: authUser?.email || '',
    avatarUrl: null as string | null,
  });
  const [langRegion, setLangRegion] = useState({ language: 'English (UK)', region: 'Ghana' });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [mapProvider, setMapProvider] = useState('Satellite (Esri)');
  const [exportFormats, setExportFormats] = useState({ pdf: true, geojson: true, shp: true, csv: false });
  const [syncSettings, setSyncSettings] = useState({ autoSync: true, frequency: 'hourly', wifiOnly: true, storageLimit: 50 });
  const [credits, setCredits] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState<1000 | 5000>(1000);
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'card'>('momo');
  const [momoNetwork, setMomoNetwork] = useState('MTN Mobile Money');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Modals state
  const [activeModal, setActiveModal] = useState<'none' | 'profile' | 'language' | 'password' | 'mapProvider' | 'exportFormats' | 'billing' | 'sync' | 'payment'>('none');

  // Form states for modals
  const [editProfile, setEditProfile] = useState(profile);
  const [editLangRegion, setEditLangRegion] = useState(langRegion);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [editMapProvider, setEditMapProvider] = useState(mapProvider);
  const [editExportFormats, setEditExportFormats] = useState(exportFormats);
  const [editSyncSettings, setEditSyncSettings] = useState(syncSettings);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  };

  const handleSaveProfile = () => {
    if (!editProfile.name.trim() || !editProfile.email.trim()) {
      toast.error('Name and email cannot be empty');
      return;
    }
    setProfile(editProfile);
    setActiveModal('none');
    toast.success('Profile updated successfully');
  };

  const handleSaveLangRegion = () => {
    setLangRegion(editLangRegion);
    setActiveModal('none');
    toast.success('Language and Region updated');
  };

  const handleSavePassword = () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwords.new.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    // Simulate API call to save password
    setPasswords({ current: '', new: '', confirm: '' });
    setActiveModal('none');
    toast.success('Password updated successfully');
  };

  const handleSaveMapProvider = () => {
    setMapProvider(editMapProvider);
    setActiveModal('none');
    toast.success(`Map provider updated to ${editMapProvider}`);
  };

  const handleSaveExportFormats = () => {
    setExportFormats(editExportFormats);
    setActiveModal('none');
    toast.success('Export preferences updated');
  };

  const handleSaveSyncSettings = () => {
    setSyncSettings(editSyncSettings);
    setActiveModal('none');
    toast.success('Data Sync settings updated');
  };

  const toggleNotifications = () => {
    const newState = !notificationsEnabled;
    setNotificationsEnabled(newState);
    toast.info(`Notifications ${newState ? 'enabled' : 'disabled'}`);
  };

  const toggleTwoFactor = () => {
    const newState = !twoFactorEnabled;
    setTwoFactorEnabled(newState);
    toast.info(`Two-Factor Authentication ${newState ? 'enabled' : 'disabled'}`);
  };

  const activeExportFormatsText = Object.entries(exportFormats)
    .filter(([_, isActive]) => isActive)
    .map(([key]) => key.toUpperCase())
    .join(', ') || 'None';

  return (
    <div className="w-full h-full bg-[#0a0a0a] pt-14 md:pt-20 pb-20 md:pb-10 px-4 md:px-8 overflow-y-auto scroll-smooth">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        
        {/* Mobile Header with Icon */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-4 md:pt-0 flex items-center gap-3 md:block"
        >
          <div className="md:hidden w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-900/30">
            <UserCircle size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-light text-white mb-1 md:mb-2">Account Settings</h1>
            <p className="text-white/40 text-sm">Manage your profile, preferences, and system access.</p>
          </div>
        </motion.div>

        {/* Profile Card */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 md:p-6">
          {/* Mobile Layout */}
          <div className="flex flex-col md:hidden gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-xl shadow-indigo-900/20 flex-shrink-0 overflow-hidden border border-white/10">
                {profile.avatarUrl ? (
                   <img src={profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                   getInitials(profile.name)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-medium text-white">{profile.name}</h2>
                <p className="text-white/40 text-sm truncate">{profile.email}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <span className={`
                px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border
                ${userRole === 'admin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 
                  userRole === 'analyst' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 
                  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}
              `}>
                {userRole}
              </span>
              <span className="text-white/20 text-xs">•</span>
              <span className="text-white/40 text-xs">Last active: Just now</span>
            </div>

            <button 
              onClick={onLogout}
              className="w-full px-4 py-3 bg-white/5 hover:bg-red-500/10 active:bg-red-500/20 hover:text-red-400 text-white/60 text-sm rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-indigo-900/20 flex-shrink-0 overflow-hidden border border-white/10">
              {profile.avatarUrl ? (
                 <img src={profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                 getInitials(profile.name)
              )}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-medium text-white">{profile.name}</h2>
                  <p className="text-white/40 text-sm">{profile.email}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`
                      px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border
                      ${userRole === 'admin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 
                        userRole === 'analyst' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 
                        'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}
                    `}>
                      {userRole}
                    </span>
                    <span className="text-white/20 text-xs">•</span>
                    <span className="text-white/40 text-xs">Last active: Just now</span>
                  </div>
                </div>
                <button 
                  onClick={onLogout}
                  className="px-4 py-2 bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-white/60 text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Role Simulator (Demo Feature) */}
        <div className="bg-gradient-to-r from-amber-900/10 to-transparent border border-amber-500/20 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 flex-shrink-0">
                 <Shield size={18} />
               </div>
               <div className="min-w-0">
                 <h3 className="text-amber-200 font-medium text-sm">Role Simulator</h3>
                 <p className="text-amber-200/50 text-xs">Switch roles to preview different permission levels.</p>
               </div>
            </div>
            <div className="flex bg-black/40 p-1 rounded-lg border border-white/10 self-start md:self-auto">
              {(['admin', 'analyst', 'viewer'] as UserRole[]).map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    onRoleChange(role);
                    toast.success(`Role switched to ${role}`);
                  }}
                  className={`
                    px-3 py-1.5 rounded text-xs font-medium capitalize transition-all
                    ${userRole === role ? 'bg-amber-600 text-white shadow-lg' : 'text-white/40 hover:text-white active:bg-white/5'}
                  `}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-4">
          
          {/* General Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <SettingsSection title="General" icon={<SettingsIcon size={16} />}>
              <SettingsItem 
                icon={<User size={16} />} 
                label="Profile Information" 
                description="Update your name and contact details"
                value="Edit"
                onClick={() => {
                  setEditProfile(profile);
                  setActiveModal('profile');
                }}
              />
              <SettingsItem 
                icon={<Globe size={16} />} 
                label="Language & Region" 
                description={`${langRegion.language} • ${langRegion.region}`}
                value="Edit"
                onClick={() => {
                  setEditLangRegion(langRegion);
                  setActiveModal('language');
                }}
              />
              <SettingsItem 
                icon={<Bell size={16} />} 
                label="Notifications" 
                description="Email digests and real-time alerts"
                toggle
                checked={notificationsEnabled}
                onClick={toggleNotifications}
              />
            </SettingsSection>
          </motion.div>

          {/* Security */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SettingsSection title="Security" icon={<Lock size={16} />}>
              <SettingsItem 
                icon={<Lock size={16} />} 
                label="Password" 
                description="Last changed 30 days ago"
                value="Update"
                onClick={() => {
                  setPasswords({ current: '', new: '', confirm: '' });
                  setActiveModal('password');
                }}
              />
              <SettingsItem 
                icon={<Smartphone size={16} />} 
                label="Two-Factor Authentication" 
                description="Enabled via Authenticator App"
                toggle
                checked={twoFactorEnabled}
                onClick={toggleTwoFactor}
              />
            </SettingsSection>
          </motion.div>

          {/* Admin Only Section */}
          {userRole === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <SettingsSection title="System Administration" icon={<Database size={16} />} highlighted>
                <SettingsItem 
                  icon={<Database size={16} />} 
                  label="Data Sync Configuration" 
                  description="Configure offline storage limits"
                  value="Configure"
                  onClick={() => {
                    setEditSyncSettings(syncSettings);
                    setActiveModal('sync');
                  }}
                />
                 <SettingsItem 
                  icon={<CreditCard size={16} />} 
                  label="Billing & Credits" 
                  description={`${credits.toLocaleString()} Credits Available`}
                  value="Top Up"
                  onClick={() => setActiveModal('billing')}
                  disabled={true}
                />
              </SettingsSection>
            </motion.div>
          )}

          {/* Analyst & Admin Section */}
          {['admin', 'analyst'].includes(userRole) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: userRole === 'admin' ? 0.4 : 0.3 }}
            >
              <SettingsSection title="Analysis Preferences" icon={<Globe size={16} />}>
                <SettingsItem 
                  icon={<Map size={16} />} 
                  label="Default Map Provider" 
                  description={mapProvider}
                  value="Change"
                  onClick={() => {
                    setEditMapProvider(mapProvider);
                    setActiveModal('mapProvider');
                  }}
                />
                <SettingsItem 
                  icon={<Database size={16} />} 
                  label="Export Formats" 
                  description={activeExportFormatsText}
                  value="Edit"
                  onClick={() => {
                    setEditExportFormats(exportFormats);
                    setActiveModal('exportFormats');
                  }}
                />
              </SettingsSection>
            </motion.div>
          )}

        </div>
      </div>

      {/* Modals */}
      <Modal 
        isOpen={activeModal === 'profile'} 
        onClose={() => setActiveModal('none')} 
        title="Edit Profile"
        onSave={handleSaveProfile}
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center mb-6">
             <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-indigo-900/20 overflow-hidden border-2 border-white/10">
                   {editProfile.avatarUrl ? (
                      <img src={editProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                   ) : (
                      getInitials(editProfile.name)
                   )}
                </div>
                <label className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-500 transition-colors shadow-lg border border-white/20">
                   <Camera size={14} className="text-white" />
                   <input 
                     type="file" 
                     accept="image/*" 
                     className="hidden" 
                     onChange={(e) => {
                       if (e.target.files && e.target.files[0]) {
                         const file = e.target.files[0];
                         const url = URL.createObjectURL(file);
                         setEditProfile({...editProfile, avatarUrl: url});
                       }
                     }} 
                   />
                </label>
             </div>
             <p className="text-xs text-white/40 mt-3">Click the camera icon to upload a picture</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Full Name</label>
            <input 
              type="text" 
              value={editProfile.name}
              onChange={e => setEditProfile({...editProfile, name: e.target.value})}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={editProfile.email}
              onChange={e => setEditProfile({...editProfile, email: e.target.value})}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'language'} 
        onClose={() => setActiveModal('none')} 
        title="Language & Region"
        onSave={handleSaveLangRegion}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Language</label>
            <Select 
              value={editLangRegion.language} 
              onValueChange={value => setEditLangRegion({...editLangRegion, language: value})}
            >
              <SelectTrigger className="w-full bg-black/50 border-white/10 text-white h-10 hover:bg-white/5 focus:ring-indigo-500/50">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent className="bg-[#111] border-white/10 text-white">
                <SelectItem value="English (UK)" className="focus:bg-white/10 focus:text-white cursor-pointer">English (UK)</SelectItem>
                <SelectItem value="English (US)" className="focus:bg-white/10 focus:text-white cursor-pointer">English (US)</SelectItem>
                <SelectItem value="French" className="focus:bg-white/10 focus:text-white cursor-pointer">French</SelectItem>
                <SelectItem value="Portuguese" className="focus:bg-white/10 focus:text-white cursor-pointer">Portuguese</SelectItem>
                <SelectItem value="Swahili" className="focus:bg-white/10 focus:text-white cursor-pointer">Swahili</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Region</label>
            <Select 
              value={editLangRegion.region} 
              onValueChange={value => setEditLangRegion({...editLangRegion, region: value})}
            >
              <SelectTrigger className="w-full bg-black/50 border-white/10 text-white h-10 hover:bg-white/5 focus:ring-indigo-500/50">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent className="bg-[#111] border-white/10 text-white">
                <SelectItem value="Malawi" className="focus:bg-white/10 focus:text-white cursor-pointer">Malawi</SelectItem>
                <SelectItem value="Kenya" className="focus:bg-white/10 focus:text-white cursor-pointer">Kenya</SelectItem>
                <SelectItem value="Ghana" className="focus:bg-white/10 focus:text-white cursor-pointer">Ghana</SelectItem>
                <SelectItem value="Nigeria" className="focus:bg-white/10 focus:text-white cursor-pointer">Nigeria</SelectItem>
                <SelectItem value="Zambia" className="focus:bg-white/10 focus:text-white cursor-pointer">Zambia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'password'} 
        onClose={() => setActiveModal('none')} 
        title="Update Password"
        onSave={handleSavePassword}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Current Password</label>
            <input 
              type="password" 
              value={passwords.current}
              onChange={e => setPasswords({...passwords, current: e.target.value})}
              placeholder="Enter current password"
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="pt-2">
            <label className="block text-xs font-medium text-white/60 mb-1.5">New Password</label>
            <input 
              type="password" 
              value={passwords.new}
              onChange={e => setPasswords({...passwords, new: e.target.value})}
              placeholder="Minimum 8 characters"
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Confirm New Password</label>
            <input 
              type="password" 
              value={passwords.confirm}
              onChange={e => setPasswords({...passwords, confirm: e.target.value})}
              placeholder="Re-enter new password"
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'mapProvider'} 
        onClose={() => setActiveModal('none')} 
        title="Default Map Provider"
        onSave={handleSaveMapProvider}
      >
        <div className="space-y-3">
          <p className="text-sm text-white/60 mb-4">Select the default basemap style for new sessions.</p>
          {[
            'Satellite (Maxar)', 
            'Satellite (Google)', 
            'Street (Mapbox)', 
            'Dark Vector (Carto)'
          ].map(provider => (
            <label key={provider} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <div className="relative flex items-center justify-center">
                <input 
                  type="radio" 
                  name="mapProvider"
                  value={provider}
                  checked={editMapProvider === provider}
                  onChange={(e) => setEditMapProvider(e.target.value)}
                  className="peer sr-only"
                />
                <div className="w-4 h-4 rounded-full border border-white/40 peer-checked:border-indigo-500 peer-checked:bg-indigo-500 flex items-center justify-center transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-black opacity-0 peer-checked:opacity-100" />
                </div>
              </div>
              <span className="text-sm text-white font-medium">{provider}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'exportFormats'} 
        onClose={() => setActiveModal('none')} 
        title="Export Formats"
        onSave={handleSaveExportFormats}
      >
        <div className="space-y-3">
          <p className="text-sm text-white/60 mb-4">Select the default formats to include when exporting intelligence reports.</p>
          {[
            { id: 'pdf', label: 'PDF Report' },
            { id: 'geojson', label: 'GeoJSON (Spatial Data)' },
            { id: 'shp', label: 'Shapefile (SHP)' },
            { id: 'csv', label: 'CSV (Raw Data)' }
          ].map(format => (
            <label key={format.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox" 
                  checked={editExportFormats[format.id as keyof typeof editExportFormats]}
                  onChange={(e) => setEditExportFormats({
                    ...editExportFormats, 
                    [format.id]: e.target.checked
                  })}
                  className="peer sr-only"
                />
                <div className="w-4 h-4 rounded border border-white/40 peer-checked:border-indigo-500 peer-checked:bg-indigo-500 flex items-center justify-center transition-colors">
                  <Check size={12} className="text-black opacity-0 peer-checked:opacity-100" />
                </div>
              </div>
              <span className="text-sm text-white font-medium">{format.label}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'billing'} 
        onClose={() => setActiveModal('none')} 
        title="Billing & Usage"
        onSave={() => setActiveModal('payment')}
        primaryActionText="Continue to Payment"
      >
        <div className="space-y-6">
          {/* Current Credits */}
          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-600/10 border border-indigo-500/20 rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <h4 className="text-white/60 text-sm font-medium mb-2">Available Balance</h4>
            <div className="text-4xl font-light text-white mb-1 flex items-baseline gap-2">
              <span className="text-indigo-400">⚡</span> {credits.toLocaleString()}
            </div>
            <p className="text-white/40 text-xs">Approx. {Math.floor(credits / 100)} analysis runs remaining</p>
          </div>

          {/* Pricing Info */}
          <div className="space-y-3">
             <h4 className="text-sm font-medium text-white">Top Up Credits</h4>
             
             <div className="grid grid-cols-2 gap-3">
                <div 
                  onClick={() => setSelectedPackage(1000)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center text-center ${selectedPackage === 1000 ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-indigo-500/50 bg-white/5'}`}
                >
                   <div className="text-lg font-medium text-white mb-1">1,000</div>
                   <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Credits</div>
                   <div className="text-sm text-indigo-400 font-medium">GHC 200</div>
                </div>
                
                <div 
                  onClick={() => setSelectedPackage(5000)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center text-center relative overflow-hidden ${selectedPackage === 5000 ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-indigo-500/50 bg-white/5'}`}
                >
                   <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>
                   <div className="text-lg font-medium text-white mb-1">5,000</div>
                   <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Credits</div>
                   <div className="text-sm text-indigo-400 font-medium">GHC 900</div>
                </div>
             </div>
          </div>

          {/* Usage Metrics */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <h4 className="text-sm font-medium text-white/80">Cost Breakdown</h4>
            
            <div className="space-y-3 text-sm">
               <div className="flex justify-between items-center pb-2 border-b border-white/5">
                 <span className="text-white/60 flex items-center gap-2"><Globe size={14}/> Spatial Analysis Run</span>
                 <span className="text-white">100 Credits</span>
               </div>
               <div className="flex justify-between items-center pb-2 border-b border-white/5">
                 <span className="text-white/60 flex items-center gap-2"><Database size={14}/> Storage (per GB/month)</span>
                 <span className="text-white">50 Credits</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-white/60 flex items-center gap-2"><Users size={14}/> Extra Analyst Seat (monthly)</span>
                 <span className="text-white">500 Credits</span>
               </div>
            </div>
          </div>
          
          <div className="bg-white/5 rounded-lg p-3 text-xs text-white/50 leading-relaxed border border-white/5">
            Credits never expire. They are automatically deducted when you run spatial analysis tasks or at the start of each month for storage and active seats.
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'sync'} 
        onClose={() => setActiveModal('none')} 
        title="Data Sync Configuration"
        onSave={handleSaveSyncSettings}
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-white">Synchronization Rules</h4>
            
            {/* Auto Sync Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-black/20">
              <div>
                <div className="text-sm text-white font-medium">Automatic Background Sync</div>
                <div className="text-xs text-white/40 mt-0.5">Keep local data updated automatically</div>
              </div>
              <div 
                onClick={() => setEditSyncSettings({...editSyncSettings, autoSync: !editSyncSettings.autoSync})}
                className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${editSyncSettings.autoSync ? 'bg-emerald-500' : 'bg-white/20'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-lg ${editSyncSettings.autoSync ? 'left-[22px]' : 'left-0.5'}`} />
              </div>
            </div>

            {/* Sync on WiFi Only Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-black/20">
              <div>
                <div className="text-sm text-white font-medium">Sync on Wi-Fi Only</div>
                <div className="text-xs text-white/40 mt-0.5">Pause sync when on cellular networks</div>
              </div>
              <div 
                onClick={() => setEditSyncSettings({...editSyncSettings, wifiOnly: !editSyncSettings.wifiOnly})}
                className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${editSyncSettings.wifiOnly ? 'bg-emerald-500' : 'bg-white/20'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-lg ${editSyncSettings.wifiOnly ? 'left-[22px]' : 'left-0.5'}`} />
              </div>
            </div>

            {/* Sync Frequency */}
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Sync Frequency</label>
              <Select 
                value={editSyncSettings.frequency} 
                onValueChange={value => setEditSyncSettings({...editSyncSettings, frequency: value})}
              >
                <SelectTrigger className="w-full bg-black/50 border-white/10 text-white h-10 hover:bg-white/5 focus:ring-indigo-500/50">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-white/10 text-white">
                  <SelectItem value="realtime" className="focus:bg-white/10 focus:text-white cursor-pointer">Real-time (High battery usage)</SelectItem>
                  <SelectItem value="hourly" className="focus:bg-white/10 focus:text-white cursor-pointer">Hourly (Recommended)</SelectItem>
                  <SelectItem value="daily" className="focus:bg-white/10 focus:text-white cursor-pointer">Daily</SelectItem>
                  <SelectItem value="manual" className="focus:bg-white/10 focus:text-white cursor-pointer">Manual only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-white flex justify-between">
              Offline Storage Limit
              <span className="text-indigo-400">{editSyncSettings.storageLimit} GB</span>
            </h4>
            
            <input 
              type="range" 
              min="5" 
              max="200" 
              step="5"
              value={editSyncSettings.storageLimit}
              onChange={(e) => setEditSyncSettings({...editSyncSettings, storageLimit: parseInt(e.target.value)})}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-white/40">
              <span>5 GB</span>
              <span>200 GB</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
             <button 
                onClick={() => toast.success('Local cache has been cleared.')}
                className="w-full px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-colors"
             >
               Clear Local Cache (4.2 GB)
             </button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'payment'} 
        onClose={() => setActiveModal('billing')} 
        title="Complete Purchase"
        onSave={() => {
          if (paymentMethod === 'momo' && !phoneNumber) {
            toast.error('Please enter your mobile money number');
            return;
          }
          setCredits(c => c + selectedPackage);
          setActiveModal('none');
          toast.success(`Successfully purchased ${selectedPackage.toLocaleString()} credits!`);
        }}
        primaryActionText={`Pay GHC ${selectedPackage === 1000 ? 200 : 900}`}
      >
        <div className="space-y-6">
          {/* Order Summary */}
          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
             <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-white/60">Credit Package</span>
                <span className="text-white font-medium">{selectedPackage.toLocaleString()} Credits</span>
             </div>
             <div className="flex justify-between items-center text-sm border-t border-white/5 pt-2 mt-2">
                <span className="text-white/60">Total Amount</span>
                <span className="text-indigo-400 font-bold">GHC {selectedPackage === 1000 ? 200 : 900}</span>
             </div>
          </div>

          {/* Payment Method Selection */}
          <div className="flex gap-2">
            <button
              onClick={() => setPaymentMethod('momo')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${paymentMethod === 'momo' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
            >
              Mobile Money
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${paymentMethod === 'card' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
            >
              Debit Card
            </button>
          </div>

          {/* Payment Forms */}
          {paymentMethod === 'momo' ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Network Provider</label>
                  <Select 
                    value={momoNetwork} 
                    onValueChange={value => setMomoNetwork(value)}
                  >
                    <SelectTrigger className="w-full bg-black/50 border-white/10 text-white h-10 hover:bg-white/5 focus:ring-indigo-500/50">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border-white/10 text-white">
                      <SelectItem value="MTN Mobile Money" className="focus:bg-white/10 focus:text-white cursor-pointer">MTN Mobile Money</SelectItem>
                      <SelectItem value="Telecash" className="focus:bg-white/10 focus:text-white cursor-pointer">Telecash</SelectItem>
                      <SelectItem value="AirtelTigo" className="focus:bg-white/10 focus:text-white cursor-pointer">AirtelTigo</SelectItem>
                    </SelectContent>
                  </Select>
               </div>
               <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Mobile Number</label>
                  <input 
                    type="tel" 
                    placeholder="e.g. 024 XXX XXXX"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
               </div>
               <p className="text-[10px] text-white/40 text-center">You will receive a prompt on your phone to authorize the payment.</p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Card Number</label>
                  <input 
                    type="text" 
                    placeholder="0000 0000 0000 0000"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  />
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Expiry Date</label>
                    <input 
                      type="text" 
                      placeholder="MM/YY"
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">CVV</label>
                    <input 
                      type="text" 
                      placeholder="123"
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
               </div>
            </div>
          )}

        </div>
      </Modal>

    </div>
  );
};

const SettingsSection = ({ title, icon, children, highlighted = false }: any) => (
  <div className={`
    border rounded-xl overflow-hidden
    ${highlighted ? 'bg-purple-900/5 border-purple-500/20' : 'bg-white/5 border-white/5'}
  `}>
    <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
      <div className={`text-white/40 ${highlighted ? 'text-purple-400' : ''}`}>{icon}</div>
      <h3 className={`font-medium text-sm ${highlighted ? 'text-purple-100' : 'text-white'}`}>{title}</h3>
    </div>
    <div className="p-2 flex flex-col space-y-1">
      {children}
    </div>
  </div>
);

const SettingsItem = ({ icon, label, description, value, toggle, checked = true, onClick, disabled = false }: any) => (
  <div onClick={disabled ? undefined : onClick} className={`flex items-center justify-between p-3 md:p-3 py-4 md:py-3 rounded-lg transition-all ${disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:bg-white/10 active:bg-white/20 group cursor-pointer'}`}>
    <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
      <div className={`flex-shrink-0 transition-colors ${disabled ? 'text-white/20' : 'text-white/40 group-hover:text-white/80'}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-white text-sm md:text-sm font-medium flex items-center gap-2">
          {label}
          {disabled && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-white/5 text-white/40 border border-white/10 font-bold">Disabled</span>}
        </div>
        <div className="text-white/40 text-xs truncate mt-0.5">{description}</div>
      </div>
    </div>
    
    <div className="flex-shrink-0 flex items-center">
      {value && (
        <span className={`text-xs font-medium px-3 py-1.5 md:px-2 md:py-1 rounded-md border transition-colors whitespace-nowrap ${disabled ? 'text-white/20 bg-white/5 border-white/5' : 'text-indigo-400 hover:text-indigo-300 active:text-indigo-200 bg-indigo-500/10 border-indigo-500/20'}`}>
          {value}
        </span>
      )}
      {toggle !== undefined && (
         <div className={`w-10 h-5 md:w-9 md:h-5 rounded-full relative transition-colors ${checked ? 'bg-emerald-500' : 'bg-white/20'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-lg ${checked ? 'left-[22px] md:left-[18px]' : 'left-0.5'}`} />
         </div>
      )}
      {toggle === undefined && !value && (
        <ChevronRight size={18} className="md:hidden text-white/20 group-hover:text-white/60" />
      )}
      {toggle === undefined && !value && (
        <ChevronRight size={16} className="hidden md:block text-white/20 group-hover:text-white/60" />
      )}
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children, onSave, primaryActionText = "Save Changes" }: any) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="relative bg-[#111] border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <button onClick={onClose} className="text-white/40 hover:text-white hover:bg-white/10 p-1 rounded-md transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="p-5">
            {children}
          </div>
          <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-black/20">
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={onSave} 
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-900/20 active:scale-[0.98]"
            >
              {primaryActionText}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
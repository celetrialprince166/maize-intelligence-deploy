import React, { useState, useEffect, useMemo } from 'react';
import { TopBar } from '@/app/components/ui/TopBar';
import { InsightPanel } from '@/app/components/ui/InsightPanel';
import { ToolsPanel, MapStyle } from '@/app/components/ui/ToolsPanel';
import { BottomBar } from '@/app/components/ui/BottomBar';
import { MapCanvas } from '@/app/components/map/MapCanvas';
import { UploadModal } from '@/app/components/ui/UploadModal';
import { ReviewDrawer } from '@/app/components/ui/ReviewDrawer';
import { ReportsView } from '@/app/components/reports/ReportsView';
import { DashboardView } from '@/app/components/dashboard/DashboardView';
import { SettingsView, UserRole } from '@/app/components/settings/SettingsView';
import { VerificationDrawer } from '@/app/components/ui/VerificationDrawer';
import { ProcessingOverlay } from '@/app/components/ui/ProcessingOverlay';
import { ErrorBoundary } from '@/app/components/ui/ErrorBoundary';
import { LoginView } from '@/app/components/auth/LoginView';
import { SignupView } from '@/app/components/auth/SignupView';
import { AnalysisFlowPanel } from '@/app/components/ui/AnalysisFlowPanel';
import { StartScreen } from '@/app/components/ui/StartScreen';
import { MapActions } from '@/app/components/ui/MapActions';
import { toast, Toaster } from 'sonner';
import { DataService, Farm, District } from '@/app/services/storage';
import { MaizeAPI } from '@/app/services/api';
import { FarmAPI } from '@/app/services/api';
import { signOut, getStoredUser } from '@/app/services/auth';
import { MigrationService } from '@/app/services/migration';
import { NotificationProvider, useNotifications } from '@/app/contexts/NotificationContext';

import { BottomNav } from '@/app/components/ui/BottomNav';

const MainApp: React.FC = () => {
  const { addNotification } = useNotifications();
  
  // Auth State — check localStorage for existing session
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const user = getStoredUser();
    return user !== null && user.idToken !== null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [userRole, setUserRole] = useState<UserRole>('admin');

  // App State
  const [activeLayers, setActiveLayers] = useState<string[]>(['classification', 'boundaries', 'show-maize', 'show-non-maize', 'show-pending', 'show-flagged']);
  const [activeSeason, setActiveSeason] = useState<number>(2023);
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  const [selectionState, setSelectionState] = useState<'none' | 'district' | 'farm'>('none');
  const [selectedData, setSelectedData] = useState<any>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(false); // Mobile Layers State
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isProcessing, setIsProcessing] = useState(false);

  // Connectivity State
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  // App Stages
  const [appStage, setAppStage] = useState<'start' | 'workspace'>('start');
  const [analysisFarms, setAnalysisFarms] = useState<Farm[]>([]);
  const [recentAnalysisFarms, setRecentAnalysisFarms] = useState<Farm[]>([]);
  const [dashboardMode, setDashboardMode] = useState<'global' | 'analysis'>('global');

  // Data State
  const [farms, setFarms] = useState<Farm[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [regions, setRegions] = useState<District[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // All farms with season-awareness flag — used for map display (polygons persist across years)
  const allFarmsWithSeasonInfo = useMemo(() => {
    return farms.map(farm => ({
      ...farm,
      hasDataForSeason: farm.year === activeSeason || !!farm.analyses?.[activeSeason],
    }));
  }, [farms, activeSeason]);

  // Year-filtered farms — used for dashboard metrics, reports, and other year-specific views
  const filteredFarms = useMemo(() => {
    return farms.filter(farm => farm.year === activeSeason);
  }, [farms, activeSeason]);

  // Drawing & Editing State
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [reviewData, setReviewData] = useState<{ geoJson: any, area: number, points: number } | null>(null);

  // Verification State
  const [verificationTarget, setVerificationTarget] = useState<any>(null);

  // Map View State
  const [mapView, setMapView] = useState<{ center: [number, number], zoom: number }>({
    center: [9.45, -0.85], // Northern Ghana (Tamale area)
    zoom: 10
  });
  const [lastMapView, setLastMapView] = useState<{ center: [number, number], zoom: number } | null>(null);
  const [lastFarmCenter, setLastFarmCenter] = useState<[number, number] | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);

  // Global Error & Network Handling
  useEffect(() => {
    const handleOnline = () => {
        setIsOffline(false);
        toast.success("Network restored", { description: "Map tiles will now load." });
    };
    const handleOffline = () => {
        setIsOffline(true);
        toast.warning("Network lost", { description: "Switched to offline vector mode." });
    };

    // Global promise rejection handler for 'Failed to fetch'
    const handleRejection = (event: PromiseRejectionEvent) => {
        // Check for common fetch errors related to maps/tiles/images
        if (event.reason?.message === 'Failed to fetch' || event.reason?.toString().includes('fetch')) {
            event.preventDefault(); // Prevent console error if possible
            if (!isOffline && isAuthenticated) {
                setIsOffline(true);
                toast.error("Connection unstable", { description: "Switched to Offline Mode to prevent errors." });
            }
        }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('unhandledrejection', handleRejection);

    // Listen for API timeout events (async fallback)
    const handleApiTimeout = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsSlowConnection(true);
      toast.warning(detail?.message || 'Server response is slow', { 
        description: 'Analysis running in background mode. Results may take 1-2 minutes.',
        duration: 10000 
      });
      // Auto-clear after 2 minutes
      setTimeout(() => setIsSlowConnection(false), 120000);
    };
    window.addEventListener('maize-api-timeout', handleApiTimeout);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('unhandledrejection', handleRejection);
        window.removeEventListener('maize-api-timeout', handleApiTimeout);
    };
  }, [isOffline, isAuthenticated]);

  // Browser back/forward button support — navigate within app tabs
  useEffect(() => {
    const validTabs = ['overview', 'dashboard', 'reports', 'settings', 'verification'];
    
    // Set initial history state
    window.history.replaceState({ tab: 'overview' }, '', '#overview');

    const handlePopState = (event: PopStateEvent) => {
      const tab = event.state?.tab;
      if (tab && validTabs.includes(tab)) {
        setActiveTab(tab);
      } else {
        // If no valid state, go to overview instead of leaving the site
        setActiveTab('overview');
        window.history.pushState({ tab: 'overview' }, '', '#overview');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load Data on Mount — async (server-backed)
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Cleanup legacy keys
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });

        await DataService.init();
        if (cancelled) return;
        setFarms(DataService.getFarms());
        setDistricts(DataService.getDistricts());

        // Load real boundaries from GEE (async, non-blocking)
        DataService.loadBoundaries().then(({ regions: realRegions, districts: realDistricts }) => {
          if (!cancelled && realDistricts.length > 0) {
            setDistricts(realDistricts);
          }
          if (!cancelled && realRegions.length > 0) {
            setRegions(realRegions);
          }
        }).catch(() => {});

        // Check for localStorage farms to migrate
        if (MigrationService.hasLocalFarms()) {
          const doMigrate = window.confirm(
            'We found farms stored locally in your browser. Would you like to migrate them to your account?\n\nClick OK to migrate, or Cancel to discard them.'
          );
          if (doMigrate) {
            const result = await MigrationService.migrate();
            if (result.migrated > 0) {
              toast.success(`Migrated ${result.migrated} farm(s) to your account`);
              await DataService.init(); // Refresh after migration
              setFarms(DataService.getFarms());
            }
            if (result.failed.length > 0) {
              toast.error(`${result.failed.length} farm(s) failed to migrate`);
            }
          } else {
            MigrationService.clearLocalFarms();
            toast.info('Local farm data cleared');
          }
        }
      } catch (error: any) {
        console.error('Data load error:', error);
        if (error.message?.includes('401')) {
          signOut();
          setIsAuthenticated(false);
        } else {
          toast.error('Failed to load farm data from server');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const toggleLayer = (layerId: string) => {
    setActiveLayers(prev => 
      prev.includes(layerId) 
        ? prev.filter(l => l !== layerId) 
        : [...prev, layerId]
    );
  };

  const handleDistrictClick = (data: any) => {
    if (isDrawingMode || isEditingMode) return;
    setSelectionState('district');
    setSelectedData(data);
    setMapView({ center: [9.45, -0.85], zoom: 12 });
  };

  const handleFarmClick = (data: any) => {
    if (isDrawingMode || isEditingMode) return;
    setSelectionState('farm');
    setSelectedData(data);
    setMapView({ center: data.center, zoom: 14 });
  };

  const handleMapClick = () => {
    if (isDrawingMode || isEditingMode) return;
    if (selectionState !== 'none') {
        setSelectionState('none');
        setSelectedData(null);
    }
  };

  const handleNavChange = (tab: string) => {
    if (isDrawingMode || isEditingMode) {
        toast.error("Please finish or cancel drawing first");
        return;
    }
    
    // Save current map view when leaving the map
    if (activeTab === 'overview' && (tab === 'dashboard' || tab === 'reports' || tab === 'settings')) {
      setLastMapView({ ...mapView });
    }
    
    // Push browser history so back button navigates within the app
    if (tab !== activeTab) {
      window.history.pushState({ tab }, '', `#${tab}`);
    }

    setActiveTab(tab);

    if (tab === 'overview') {
        // Restore last map view when returning to map
        if (lastMapView) {
          setMapView(lastMapView);
          setLastMapView(null);
        }
        setSelectionState('none');
        setSelectedData(null);
    }
    
    if (tab === 'dashboard' && dashboardMode === 'analysis' && recentAnalysisFarms.length > 0) {
       // Keep analysis mode if we are switching to dashboard and have recent analysis
    } else {
       setDashboardMode('global'); // Reset to global when clicking tabs manually
    }
    
    if (tab === 'verification') {
        if (!activeLayers.includes('verification')) {
            toggleLayer('verification');
        }
        setSelectionState('none');
    }
  };

  const handlePanelAction = (action: string, payload?: any) => {
    if (action === 'back-to-overview') {
      setSelectionState('none');
      setSelectedData(null);
      setSelectedDistrictId(null);
      // Don't reset map position — stay where the user is
      return;
    }
    if (action === 'select-farm' && payload?.center) {
      setSelectionState('farm');
      setSelectedData(payload);
      setMapView({ center: payload.center, zoom: 16 });
      return;
    }
    if (action === 'zoom') setMapView({ center: [9.425, -0.835], zoom: 14 });
    
    // Handle district zoom from spatial insights
    if (action === 'zoom-district') {
      if (payload?.center) {
        setMapView({ center: payload.center, zoom: 11 });
        setSelectedDistrictId(payload.districtId);
        // Find the district and select it
        const district = districts.find(d => d.id === payload.districtId);
        if (district) {
          setSelectionState('district');
          setSelectedData(district);
          toast.info(`Viewing ${payload.districtName}`, {
            description: 'Map centered on selected district'
          });
        }
      }
    }
    
    if (action === 'zoom-region') {
      if (payload?.region === 'northern') setMapView({ center: [9.55, -0.78], zoom: 11 });
      if (payload?.region === 'bono-east') setMapView({ center: [9.78, -0.47], zoom: 11 });
    }
    if (action === 'filter-alert') setMapView({ center: [9.65, -0.60], zoom: 12 });
    if (action === 'verify-mode') {
        if (!activeLayers.includes('verification')) toggleLayer('verification');
        setActiveTab('verification');
    }
    
    if (action === 'verify') {
        setVerificationTarget(selectedData || { id: 'F-Unknown' });
        // Only switch to satellite if online
        if (!isOffline && mapStyle !== 'satellite') {
           setMapStyle('satellite');
           toast.info("Switched to Satellite view for verification");
        }
    }
    if (action === 'flag') {
        if (selectedData) {
            DataService.updateFarmStatus(selectedData.id, 'flagged').then(() => {
                setFarms([...DataService.getFarms()]);
            });
            toast.warning("Farm flagged for physical inspection");
        }
    }
    if (action === 'reject') {
        if (selectedData) {
            DataService.updateFarmStatus(selectedData.id, 'rejected').then(() => {
                setFarms([...DataService.getFarms()]);
            });
            toast.error("Farm rejected.");
        }
    }
    if (action === 'analyze-farm') {
        if (payload) {
            setAnalysisFarms(prev => [...prev, payload]);
            toast.success(`Running analysis on ${payload.name || 'farm'}...`);
        }
    }
    if (action === 'view-in-dashboard') {
        if (payload) {
            setSelectionState('farm');
            setSelectedData(payload);
            setActiveTab('dashboard');
        }
    }
    if (action === 'export') toast.success("Exporting report...");
  };

  const handleSearchSelect = (result: any) => {
    setMapView({ center: result.center, zoom: result.type === 'district' ? 12 : 15 });
    setSelectionState(result.type);
    setSelectedData(result);
    if (activeTab === 'reports' || activeTab === 'dashboard') setActiveTab('overview');
    toast.info(`Navigated to ${result.name}`);
  };

  const [processingGeoJSON, setProcessingGeoJSON] = useState<any>(null);

  const handleUploadStart = (parsedGeoJSON?: any) => {
    setIsUploadModalOpen(false);
    setIsProcessing(true);
    setProcessingGeoJSON(parsedGeoJSON);
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
    if (!processingGeoJSON) {
      toast.error("No valid dataset was parsed.");
      setProcessingGeoJSON(null);
      return;
    }

    const doImport = async () => {
      try {
        const newFarms = await DataService.importGeoJSON(processingGeoJSON, activeSeason);
        setFarms(DataService.getFarms());

        if (newFarms.length > 0) {
          setMapView({ center: newFarms[0].center, zoom: 12 });
          setLastFarmCenter(newFarms[0].center);
        }

        toast.success(`Imported ${newFarms.length} farm(s)`, {
          description: 'Farms added to map. Select farms from Map Controls to analyze them, or they will appear as pending.',
          duration: 6000,
        });

        if (newFarms.length > 50) {
          toast.warning('Large upload detected', {
            description: `You uploaded ${newFarms.length} farms. For best performance, analyze them in batches of 10-50 at a time.`,
            duration: 10000,
          });
        }

        if (!activeLayers.includes('yield')) {
          setActiveLayers(prev => [...prev, 'yield']);
        }
      } catch (e: any) {
        toast.error('Error importing data: ' + e.message);
      } finally {
        setProcessingGeoJSON(null);
      }
    };

    doImport();
  };

  const startDrawing = () => {
    setIsDrawingMode(true);
    setIsEditingMode(false);
    setReviewData(null);
    setSelectionState('none');
    toast.info("Tap on map to add points.");
  };

  const handleDrawingComplete = (points: any[], area: number) => {
    const wasEditing = isEditingMode;
    setIsDrawingMode(false);
    setIsEditingMode(false);
    setReviewData({ geoJson: points, area, points: points.length });
    if (wasEditing) {
      toast.success("Boundary updated");
      addNotification({
        type: 'success',
        title: 'Boundary Updated',
        message: 'Farm boundary edits have been saved to local workspace.',
      });
    }
  };

  const handleDrawingCancel = () => {
    setIsDrawingMode(false);
    setIsEditingMode(false);
    if (isEditingMode && reviewData) toast("Edits discarded");
    else {
       toast("Drawing cancelled");
       setReviewData(null);
    }
  };

  const handleReviewConfirm = (customName?: string) => {
    if (!reviewData) { setReviewData(null); return; }

    const doConfirm = async () => {
      try {
        const coords = reviewData.geoJson.map((p: any) => [p.lat, p.lng] as [number, number]);
        const centerLat = coords.reduce((sum: number, c: [number, number]) => sum + c[0], 0) / coords.length;
        const centerLng = coords.reduce((sum: number, c: [number, number]) => sum + c[1], 0) / coords.length;

        const newFarm = await DataService.addFarm({
          name: customName || `New Farm ${new Date().toLocaleTimeString()}`,
          status: 'pending',
          area: reviewData.area,
          coordinates: coords,
          center: [centerLat, centerLng],
          yield: 0,
          year: activeSeason,
        });
        setFarms(DataService.getFarms());
        toast.success('Farm saved — running analysis...');

        addNotification({
          type: 'system',
          title: 'New Farm Digitized',
          message: `A new farm boundary (${reviewData.area.toFixed(2)} ha) was added. Running analysis...`,
          farmId: newFarm.id,
        });

        setLastFarmCenter(newFarm.center);
        setMapView({ center: newFarm.center, zoom: 15 });
        
        // Auto-trigger analysis
        setAnalysisFarms(prev => [...prev, newFarm]);
      } catch (e) {
        toast.error('Failed to save farm.');
      }
    };

    doConfirm();
    setReviewData(null);
  };

  const isModeActive = isDrawingMode || isEditingMode;

  const handleReportViewDetails = (farm: Farm) => {
    setMapView({ center: farm.center, zoom: 16 });
    setSelectionState('farm');
    setSelectedData(farm);
    setActiveTab('overview');
    
    // Check if farm is an anomaly, and if so, automatically open the Verification/Investigation drawer
    const isAnomaly = (farm.yield && (farm.yield > 6 || farm.yield < 2)) || (farm.confidence && farm.confidence < 0.85);
    
    if (isAnomaly) {
      setVerificationTarget(farm);
      if (!isOffline && mapStyle !== 'satellite') {
         setMapStyle('satellite');
      }
      toast.warning(`Anomaly Investigation Started for ${farm.name || 'Farm'}`, {
        description: 'Please review the detected discrepancies.'
      });
    } else {
      toast.info(`Navigated to ${farm.name || 'Farm Details'}`);
    }
  };

  const handleMapFocusFromNotification = (farmIdStr: string) => {
    if (farmIdStr === 'history') {
      setActiveTab('reports');
      toast.info('Viewing all intelligence history');
      return;
    }

    // Attempt to parse farm ID if needed, or find by name/id
    const targetFarm = farms.find(f => 
      f.id === farmIdStr || 
      f.name.toLowerCase().includes(farmIdStr.replace('#', '').toLowerCase())
    );
    
    if (targetFarm) {
      setMapView({ center: targetFarm.center, zoom: 16 });
      setSelectionState('farm');
      setSelectedData(targetFarm);
      setActiveTab('overview');
      toast.success(`Focused on ${targetFarm.name}`);
    } else {
      toast.error(`Could not locate farm: ${farmIdStr}`);
    }
  };

  const isViewSettings = activeTab === 'settings';

  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-center" theme="dark" />
        {authMode === 'login' ? (
          <LoginView 
            onLogin={() => setIsAuthenticated(true)} 
            onNavigateToSignup={() => setAuthMode('signup')}
          />
        ) : (
          <SignupView 
            onSignup={() => setIsAuthenticated(true)}
            onNavigateToLogin={() => setAuthMode('login')}
          />
        )}
      </>
    );
  }

  if (appStage === 'start') {
    return (
      <>
        <Toaster position="top-center" theme="dark" />
        <StartScreen 
          onSelectUpload={() => {
            setAppStage('workspace');
            setIsUploadModalOpen(true);
          }}
          onSelectDraw={() => {
            setAppStage('workspace');
            startDrawing();
          }}
          onSkip={() => {
            setAppStage('workspace');
          }}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <Toaster position="top-center" theme="dark" />
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-white/60 text-sm">Loading your farms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-sans text-white selection:bg-green-500/30">
        <Toaster position="top-center" theme="dark" />
        
        <TopBar 
          onUploadClick={() => setIsUploadModalOpen(true)} 
          onStartDrawing={startDrawing}
          activeTab={activeTab}
          onNavChange={handleNavChange}
          onSearchSelect={handleSearchSelect}
          isOffline={isOffline}
          isSlowConnection={isSlowConnection}
          onToggleOffline={() => {
               const newState = !isOffline;
               setIsOffline(newState);
               toast(newState ? "Offline Mode: Tiles Disabled" : "Online Mode: Tiles Enabled");
          }}
          onMapFocus={handleMapFocusFromNotification}
        />

      <div className={activeTab === 'reports' || activeTab === 'dashboard' || isViewSettings ? 'hidden' : 'block w-full h-full'}>
        <ErrorBoundary fallback={
            <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0a] text-white/40">
                <p>Map Engine Unavailable (Offline)</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-white/10 rounded hover:bg-white/20 text-white text-sm">Retry</button>
            </div>
        }>
            <MapCanvas 
                activeLayers={activeLayers}
                activeSeason={activeSeason}
                mapStyle={mapStyle}
                farms={allFarmsWithSeasonInfo}
                districts={districts}
                regions={regions}
                onDistrictClick={handleDistrictClick}
                onFarmClick={handleFarmClick}
                onMapClick={handleMapClick}
                center={mapView.center}
                zoom={mapView.zoom}
                selectedDistrictId={selectedDistrictId}
                isDrawingMode={isDrawingMode}
                isEditingMode={isEditingMode}
                initialEditPoints={isEditingMode && reviewData ? reviewData.geoJson : []}
                onDrawingComplete={handleDrawingComplete}
                onDrawingCancel={handleDrawingCancel}
                isVisible={activeTab !== 'reports' && activeTab !== 'dashboard' && !isViewSettings}
                isOffline={isOffline}
                onTileError={() => {
                    // Immediate failover on first tile error
                    if (!isOffline) {
                        setIsOffline(true);
                        toast.error("Tiles blocked. Switching to Offline Mode.");
                    }
                }}
            />
        </ErrorBoundary>
      </div>

      {activeTab === 'reports' && (
        <ReportsView 
          onViewDetails={handleReportViewDetails} 
          farms={filteredFarms}
        />
      )}

      {activeTab === 'dashboard' && (
        <DashboardView 
            farms={dashboardMode === 'analysis' && recentAnalysisFarms.length > 0 ? recentAnalysisFarms : filteredFarms} 
            mode={dashboardMode}
            selectedFarm={selectionState === 'farm' ? selectedData : null}
            activeSeason={activeSeason}
            onSwitchToGlobal={() => setDashboardMode('global')}
            onSwitchToAnalysis={recentAnalysisFarms.length > 0 ? () => setDashboardMode('analysis') : undefined}
            onClearSelection={() => { setSelectionState('none'); setSelectedData(null); }}
            onSelectFarm={(farm) => { setSelectionState('farm'); setSelectedData(farm); }}
        />
      )}

      {isViewSettings && (
        <SettingsView 
            userRole={userRole} 
            onRoleChange={setUserRole} 
            onLogout={() => { signOut(); setIsAuthenticated(false); }}
        />
      )}

      {!isModeActive && !isViewSettings && activeTab !== 'reports' && activeTab !== 'dashboard' && (
        <InsightPanel 
            selectionState={selectionState} 
            selectedData={selectedData}
            onAction={handlePanelAction}
            activeTab={activeTab}
            districts={districts}
            farms={allFarmsWithSeasonInfo}
            activeSeason={activeSeason}
            analysisFarms={analysisFarms}
            onAnalysisComplete={() => {
                DataService.refresh().then(updatedFarms => {
                    const analysisIds = new Set(analysisFarms.map(f => f.id));
                    const updatedAnalysisFarms = updatedFarms.filter(f => analysisIds.has(f.id));
                    setRecentAnalysisFarms(updatedAnalysisFarms.length > 0 ? updatedAnalysisFarms : [...analysisFarms]);
                    setFarms(updatedFarms);
                    setAnalysisFarms([]);
                    setDashboardMode('analysis');
                    setActiveTab('dashboard');
                    toast.success('Dashboard customized with your verified data.');
                });
            }}
            onAnalysisDismiss={() => {
                // Clear analysis state and return to normal view
                setAnalysisFarms([]);
                DataService.refresh().then(f => setFarms(f));
            }}
            onDataUpdate={() => DataService.refresh().then(f => setFarms(f))}
            onFarmRename={async (farmId, newName) => {
              await DataService.updateFarm(farmId, { name: newName });
              setFarms(DataService.getFarms());
              if (selectedData?.id === farmId) {
                setSelectedData({ ...selectedData, name: newName });
              }
              toast.success(`Renamed to "${newName}"`);
            }}
        />
      )}

      {!isModeActive && !isViewSettings && activeTab !== 'reports' && activeTab !== 'dashboard' && (
        <ToolsPanel 
            activeLayers={activeLayers} 
            onToggleLayer={toggleLayer}
            mapStyle={mapStyle}
            onMapStyleChange={setMapStyle}
            isOpen={isLayersOpen}
            onClose={() => setIsLayersOpen(false)}
            farms={allFarmsWithSeasonInfo}
            onRecenter={
              lastFarmCenter
                ? () => setMapView({ center: lastFarmCenter, zoom: 15 })
                : farms.length > 0
                  ? () => setMapView({ center: farms[0].center, zoom: 12 })
                  : undefined
            }
            onClearWorkspace={async () => {
              const count = farms.length;
              if (count === 0) { toast.info('No farms to clear'); return; }
              if (!confirm(`Delete all ${count} farm(s) permanently?\n\nThis cannot be undone.`)) return;
              
              const toastId = toast.loading(`Deleting ${count} farm(s)...`, { duration: Infinity });
              
              try {
                // Use batch delete for speed (single API call)
                const farmIds = farms.map(f => f.id);
                const result = await FarmAPI.batchDeleteFarms(farmIds);
                
                DataService.clearLocalCache();
                setFarms([]);
                setSelectionState('none');
                setSelectedData(null);
                setAnalysisFarms([]);
                setRecentAnalysisFarms([]);
                setLastFarmCenter(null);
                
                toast.success(`Deleted ${result.count} farm(s)${result.failed.length > 0 ? ` (${result.failed.length} failed)` : ''}`, { id: toastId });
              } catch (err: any) {
                toast.error(`Delete failed: ${err.message}`, { id: toastId });
              }
            }}
        />
      )}

      {!isModeActive && !isViewSettings && (
        <BottomNav 
            activeTab={activeTab} 
            onNavChange={handleNavChange}
            onToggleLayers={() => setIsLayersOpen(!isLayersOpen)}
        />
      )}

      {!isModeActive && !isViewSettings && activeTab !== 'reports' && activeTab !== 'dashboard' && (
        <BottomBar 
            activeSeason={activeSeason} 
            onSeasonChange={setActiveSeason}
        />
      )}

      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)}
        onStartDrawing={startDrawing}
        onUpload={handleUploadStart}
      />

      <ReviewDrawer 
        isOpen={!!reviewData && !isEditingMode} 
        data={reviewData}
        activeSeason={activeSeason}
        onSeasonChange={setActiveSeason}
        onConfirm={handleReviewConfirm}
        onEdit={() => { if(reviewData) setIsEditingMode(true); }}
        onRedraw={() => { setReviewData(null); setIsDrawingMode(true); }}
        onCancel={() => setReviewData(null)}
      />

      <VerificationDrawer 
        isOpen={!!verificationTarget}
        data={verificationTarget}
        onApprove={() => { 
            if(verificationTarget) {
                DataService.updateFarmStatus(verificationTarget.id, 'verified').then(() => {
                    setFarms([...DataService.getFarms()]);
                });
                toast.success("Verified"); 
                setVerificationTarget(null);
            }
        }}
        onFlag={() => {
            if(verificationTarget) {
                DataService.updateFarmStatus(verificationTarget.id, 'flagged').then(() => {
                    setFarms([...DataService.getFarms()]);
                });
                toast.warning("Flagged");
                
                addNotification({
                  type: 'verification',
                  title: 'Farm Flagged for Review',
                  message: `Farm ${verificationTarget.name} was flagged during intelligence verification.`,
                  farmId: verificationTarget.id
                });
                
                setVerificationTarget(null);
            }
        }}
        onReject={() => {
            if(verificationTarget) {
                DataService.updateFarmStatus(verificationTarget.id, 'rejected').then(() => {
                    setFarms([...DataService.getFarms()]);
                });
                toast.error("Rejected");
                setVerificationTarget(null);
            }
        }}
        onClose={() => setVerificationTarget(null)}
        isOffline={isOffline}
      />

      <ProcessingOverlay 
        isVisible={isProcessing}
        onComplete={handleProcessingComplete}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <NotificationProvider>
      <MainApp />
    </NotificationProvider>
  );
};

export default App;
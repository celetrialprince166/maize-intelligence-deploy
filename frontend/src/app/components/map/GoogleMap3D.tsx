// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { Loader2, AlertTriangle } from 'lucide-react';

// --- Types ---

export interface GoogleMap3DProps {
  center: [number, number];
  zoom: number;
  tilt?: number;
  heading?: number;
  mapId?: string;
  apiKey?: string;
}

interface GoogleMapInternalProps extends GoogleMap3DProps {
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}

// --- Constants ---

const DEFAULT_API_KEY = 'YOUR_API_KEY_HERE'; // Placeholder to force user input
const STORAGE_KEY = 'google_maps_api_key';

// --- Components ---

const GoogleMapComponent: React.FC<GoogleMapInternalProps> = ({ 
  center, 
  zoom, 
  tilt = 45, 
  heading = 0,
  mapId = 'DEMO_MAP_ID',
  mapRef
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && !mapRef.current) {
      mapRef.current = new window.google.maps.Map(ref.current, {
        center: { lat: center[0], lng: center[1] },
        zoom,
        mapId,
        tilt,
        heading,
        disableDefaultUI: true,
        mapTypeId: 'satellite',
      });
    }
  }, [center, zoom, tilt, heading, mapId, mapRef]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setCenter({ lat: center[0], lng: center[1] });
      mapRef.current.setZoom(zoom);
      mapRef.current.setTilt(tilt);
      mapRef.current.setHeading(heading);
    }
  }, [center, zoom, tilt, heading]);

  return <div ref={ref} className="w-full h-full" />;
};

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center w-full h-full bg-[#0a0a0a] text-white">
    <Loader2 className="animate-spin mb-2" />
    <span className="text-xs opacity-50">Loading Google Maps 3D...</span>
  </div>
);

const ErrorState = ({ errorMsg }: { errorMsg?: string }) => (
  <div className="flex flex-col items-center justify-center w-full h-full bg-[#0a0a0a] text-red-500 p-6 text-center">
    <AlertTriangle size={32} className="mb-4 opacity-80" />
    <span className="font-bold text-lg mb-2">Map Error</span>
    <span className="text-sm opacity-75 mb-4">
      {errorMsg || "Failed to load Google Maps API"}
    </span>
    <div className="text-xs opacity-50 max-w-xs border border-red-900/30 bg-red-900/10 p-3 rounded">
       Common causes: Invalid API Key, Billing not enabled, or Quota exceeded.
    </div>
    <button 
       onClick={() => {
           localStorage.removeItem(STORAGE_KEY);
           window.location.reload();
       }}
       className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
    >
       Reset API Key
    </button>
  </div>
);

const RenderStatus = (status: Status) => {
  if (status === Status.LOADING) return <LoadingState />;
  if (status === Status.FAILURE) return <ErrorState />;
  return null;
};

export const GoogleMap3D: React.FC<GoogleMap3DProps> = (props) => {
  const [currentKey, setCurrentKey] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return props.apiKey || DEFAULT_API_KEY;
  });

  const [inputVal, setInputVal] = useState('');
  const [isKeySet, setIsKeySet] = useState(!!currentKey && currentKey !== 'YOUR_API_KEY_HERE');
  const mapRef = useRef<google.maps.Map | null>(null);

  const handleSaveKey = () => {
    const trimmedKey = inputVal.trim();
    if (trimmedKey) {
      localStorage.setItem(STORAGE_KEY, trimmedKey);
      setCurrentKey(trimmedKey);
      setIsKeySet(true);
      window.location.reload();
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentKey(DEFAULT_API_KEY);
    setIsKeySet(DEFAULT_API_KEY !== 'YOUR_API_KEY_HERE');
    window.location.reload();
  };

  if (!isKeySet) {
    return (
      <div className="w-full h-full bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4 text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Enable Google 3D Maps</h3>
          <p className="text-sm text-white/60 mb-6">
            To view 3D imagery, you need a valid Google Maps API Key.
            <br/><span className="text-xs opacity-50">(Get one from the Google Cloud Console)</span>
          </p>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Paste your API Key here (starts with AIza...)" 
              className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
            />
            <button 
              onClick={handleSaveKey}
              disabled={!inputVal}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
          <p className="mt-4 text-[10px] text-white/30">
            Key is stored locally in your browser. We do not save or transmit it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative isolate group">
      <Wrapper apiKey={currentKey} render={RenderStatus} libraries={['places', 'marker']}>
        <GoogleMapComponent {...props} mapRef={mapRef} />
      </Wrapper>
      
      {/* Map Info Overlay */}
      <div className="absolute bottom-6 left-6 bg-black/80 backdrop-blur text-white p-3 rounded-lg border border-white/10 text-xs max-w-xs z-10 pointer-events-none transition-opacity duration-300 opacity-100 group-hover:opacity-0">
        <h3 className="font-bold mb-1 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Google 3D Imagery
        </h3>
        <p className="opacity-70">
          Rendering using Google Maps JavaScript API with Vector Map support.
          Tilt and Heading are enabled for 3D perspective.
        </p>
      </div>

      <button 
        onClick={handleClearKey}
        className="absolute bottom-6 right-6 bg-black/50 hover:bg-red-900/50 backdrop-blur text-white/50 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 text-[10px] z-50 transition-colors pointer-events-auto"
      >
        Clear API Key
      </button>
    </div>
  );
};

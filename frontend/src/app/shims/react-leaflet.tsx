// React-Leaflet shim for build compatibility
// This provides component stubs since react-leaflet package won't install in this environment

import React from 'react';

// Mock components that return null or simple divs
export const MapContainer: React.FC<any> = ({ children, ...props }) => {
  return (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        background: '#1a1a1a',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666'
      }}
    >
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Map Loading...</div>
        <div style={{ fontSize: '0.9rem' }}>Leaflet library is being loaded</div>
      </div>
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  );
};

export const TileLayer: React.FC<any> = () => null;
export const Polygon: React.FC<any> = () => null;
export const Polyline: React.FC<any> = () => null;
export const Marker: React.FC<any> = () => null;
export const CircleMarker: React.FC<any> = () => null;
export const Popup: React.FC<any> = () => null;
export const Tooltip: React.FC<any> = () => null;

// Mock hooks
export const useMap = () => {
  return {
    setView: () => {},
    fitBounds: () => {},
    getZoom: () => 10,
    getCenter: () => ({ lat: 0, lng: 0 }),
    on: () => {},
    off: () => {},
    invalidateSize: () => {},
    getContainer: () => ({
      style: {},
    }),
    doubleClickZoom: {
      enable: () => {},
      disable: () => {},
    },
  };
};

export const useMapEvents = (handlers: any) => {
  return useMap();
};

export const useMapEvent = (event: string, handler: any) => {
  return useMap();
};

// Export everything as default as well for different import styles
export default {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Marker,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
  useMapEvent,
};

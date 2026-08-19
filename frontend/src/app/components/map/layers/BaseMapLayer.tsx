import React from 'react';
import { TileLayer } from '@/app/shims/react-leaflet';
import { MapStyle } from '@/app/components/ui/ToolsPanel';

interface BaseMapLayerProps {
  style: MapStyle;
  isOffline?: boolean;
  onTileError?: () => void;
}

export const BaseMapLayer: React.FC<BaseMapLayerProps> = ({ style, isOffline, onTileError }) => {
  if (isOffline) {
    return null; // Vector-only mode: transparent map background (shows container bg)
  }

  const handleTileError = (e: any) => {
    // Prevent default alert if any
    if (onTileError) onTileError();
  };

  switch (style) {
    case 'satellite':
      return (
        <>
          <TileLayer
            attribution='&copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            eventHandlers={{ tileerror: handleTileError }}
          />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
            zIndex={1000}
            opacity={0.8}
            eventHandlers={{ tileerror: handleTileError }}
          />
        </>
      );
    case 'light':
      return (
        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          eventHandlers={{ tileerror: handleTileError }}
        />
      );
    case 'dark':
    default:
      return (
        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          eventHandlers={{ tileerror: handleTileError }}
        />
      );
  }
};

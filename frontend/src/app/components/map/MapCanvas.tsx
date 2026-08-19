import React, { useState, useEffect } from 'react';
import * as turf from '@turf/helpers';
import turfArea from '@turf/area';

import { District, Farm } from '@/app/services/storage';
import { MapStyle } from '@/app/components/ui/ToolsPanel';

import { DrawingHUD } from './DrawingHUD';
import { GoogleMap3D } from './GoogleMap3D';
import { CustomMapRenderer } from './CustomMapRenderer';
import { HealthGradientOverlay } from './HealthGradientOverlay';

interface MapCanvasProps {
  activeLayers: string[];
  activeSeason: number;
  mapStyle: MapStyle;
  farms: Farm[];
  districts: District[];
  regions?: District[];
  onDistrictClick: (data: District) => void;
  onFarmClick: (data: Farm) => void;
  onMapClick: () => void;
  center?: [number, number];
  zoom?: number;
  selectedDistrictId?: string | null;
  isDrawingMode?: boolean;
  isEditingMode?: boolean;
  initialEditPoints?: any[];
  onDrawingComplete?: (geoJson: any, area: number) => void;
  onDrawingCancel?: () => void;
  isVisible?: boolean; 
  isOffline?: boolean;
  onTileError?: () => void;
}

/** Collect farms that have pixel_grid data for the active season */
function getFarmsWithPixelGrid(farms: Farm[], activeSeason: number, activeLayers: string[]) {
  const showOverlay = activeLayers.includes('yield') || activeLayers.includes('classification');
  if (!showOverlay) return [];

  return farms.filter(f => {
    const analysis = f.analyses?.[activeSeason];
    return analysis?.pixel_grid != null;
  });
}

export const MapCanvas: React.FC<MapCanvasProps> = ({ 
  activeLayers,
  activeSeason,
  mapStyle,
  farms,
  districts,
  regions = [],
  onDistrictClick, 
  onFarmClick,
  onMapClick,
  center = [9.45, -0.85],
  zoom = 11,
  selectedDistrictId = null,
  isDrawingMode = false,
  isEditingMode = false,
  initialEditPoints = [],
  onDrawingComplete,
  onDrawingCancel,
  isVisible = true,
  isOffline = false,
  onTileError
}) => {
  const [points, setPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ lat: number; lng: number }>>([]);
  const [stats, setStats] = useState({ count: 0, area: 0 });

  useEffect(() => {
    if (isEditingMode && initialEditPoints.length > 0) {
      // Handle both [lat, lng] array or {lat, lng} object
      const latLngs = initialEditPoints.map((p: any) => {
         if (Array.isArray(p)) return { lat: p[0], lng: p[1] };
         return { lat: p.lat, lng: p.lng };
      });
      
      setPoints(latLngs);
      setRedoStack([]);
      try {
         const ring = latLngs.map(p => [p.lng, p.lat]);
         ring.push([latLngs[0].lng, latLngs[0].lat]);
         const poly = turf.polygon([ring]);
         const area = turfArea(poly) / 10000;
         setStats({ count: latLngs.length, area });
      } catch (e) {
         setStats({ count: latLngs.length, area: 0 });
      }
    } else if (isDrawingMode) {
      setPoints([]);
      setRedoStack([]);
      setStats({ count: 0, area: 0 });
    }
  }, [isEditingMode, isDrawingMode, initialEditPoints]);

  const handleMapPointClick = (lat: number, lng: number) => {
    if (isDrawingMode || isEditingMode) {
      const newPoints = [...points, { lat, lng }];
      setPoints(newPoints);
      setRedoStack([]); // Clear redo stack on new action

      // Calculate area if we have at least 3 points
      if (newPoints.length >= 3) {
        try {
          const ring = newPoints.map(p => [p.lng, p.lat]);
          ring.push([newPoints[0].lng, newPoints[0].lat]);
          const poly = turf.polygon([ring]);
          const area = turfArea(poly) / 10000;
          setStats({ count: newPoints.length, area });
        } catch (e) {
          setStats({ count: newPoints.length, area: 0 });
        }
      } else {
        setStats({ count: newPoints.length, area: 0 });
      }
    }
  };
  
  const handleFinish = () => {
    if (onDrawingComplete) onDrawingComplete(points, stats.area);
    setRedoStack([]);
  };

  const handleCancel = () => {
    setPoints([]);
    setRedoStack([]);
    setStats({ count: 0, area: 0 });
    if (onDrawingCancel) onDrawingCancel();
  };

  const handleUndo = () => {
    if (points.length === 0) return;
    const lastPoint = points[points.length - 1];
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    setRedoStack(prev => [...prev, lastPoint]);

    // Recalculate area
    if (newPoints.length >= 3) {
      try {
        const ring = newPoints.map(p => [p.lng, p.lat]);
        ring.push([newPoints[0].lng, newPoints[0].lat]);
        const poly = turf.polygon([ring]);
        const area = turfArea(poly) / 10000;
        setStats({ count: newPoints.length, area });
      } catch (e) {
        setStats({ count: newPoints.length, area: 0 });
      }
    } else {
      setStats({ count: newPoints.length, area: 0 });
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const pointToRestore = redoStack[redoStack.length - 1];
    const newPoints = [...points, pointToRestore];
    setPoints(newPoints);
    setRedoStack(prev => prev.slice(0, -1));

    // Recalculate area
    if (newPoints.length >= 3) {
      try {
        const ring = newPoints.map(p => [p.lng, p.lat]);
        ring.push([newPoints[0].lng, newPoints[0].lat]);
        const poly = turf.polygon([ring]);
        const area = turfArea(poly) / 10000;
        setStats({ count: newPoints.length, area });
      } catch (e) {
        setStats({ count: newPoints.length, area: 0 });
      }
    } else {
      setStats({ count: newPoints.length, area: 0 });
    }
  };

  const isModeActive = isDrawingMode || isEditingMode;

  if (mapStyle === 'google-embed') {
    return (
       <GoogleMap3D 
          center={center} 
          zoom={zoom} 
          tilt={45} 
          heading={0} 
       />
    );
  }

  return (
    <div className="w-full h-full bg-[#0a0a0a] relative isolate">
      <CustomMapRenderer 
        farms={farms}
        districts={districts}
        regions={regions}
        activeLayers={activeLayers}
        mapStyle={mapStyle}
        center={center}
        zoom={zoom}
        selectedDistrictId={selectedDistrictId}
        onFarmClick={onFarmClick}
        onDistrictClick={onDistrictClick}
        onMapClick={onMapClick}
        isOffline={isOffline}
        isDrawingMode={isDrawingMode}
        isEditingMode={isEditingMode}
        drawPoints={points}
        onMapPointClick={handleMapPointClick}
      />

      {/* Health gradient overlays for farms with pixel_grid data (Requirement 2.4) */}
      {getFarmsWithPixelGrid(farms, activeSeason, activeLayers).map(farm => {
        const pg = farm.analyses![activeSeason].pixel_grid!;
        return (
          <HealthGradientOverlay
            key={`hgo-${farm.id}-${activeSeason}`}
            pixelGrid={pg}
            bounds={pg.bbox as [number, number, number, number]}
          />
        );
      })}

      <DrawingHUD 
        isVisible={isModeActive} 
        mode={isEditingMode ? 'edit' : 'draw'}
        pointsCount={stats.count} 
        area={stats.area}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canRedo={redoStack.length > 0}
        onCancel={handleCancel}
        onFinish={handleFinish}
      />
    </div>
  );
};

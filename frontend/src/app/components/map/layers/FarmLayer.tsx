// @ts-nocheck
import React from 'react';
import { Polygon, Popup } from '@/app/shims/react-leaflet';
import L from '@/app/shims/leaflet';
import { Farm } from '@/app/services/storage';
import { getStatusColor } from '../utils';

interface FarmLayerProps {
  farms: Farm[];
  onFarmClick: (data: Farm) => void;
  showHealthGradient?: boolean;
}

export const FarmLayer: React.FC<FarmLayerProps> = ({ farms, onFarmClick, showHealthGradient = false }) => {
  const getHealthColor = (farm: Farm) => {
    if (!farm.yield) return getStatusColor(farm.status);
    if (farm.yield >= 6) return '#10b981'; // Green - Good
    if (farm.yield >= 3.5) return '#eab308'; // Yellow - Moderate
    return '#ef4444'; // Red - Poor
  };

  return (
    <>
      {farms.map(f => {
        if (!f.coordinates || f.coordinates.length < 3) return null;

        const color = showHealthGradient ? getHealthColor(f) : getStatusColor(f.status);

        return (
            <Polygon 
                key={f.id}
                positions={f.coordinates as L.LatLngExpression[]}
                pathOptions={{ 
                    color: color, 
                    weight: showHealthGradient ? 3 : 2, 
                    fillColor: color, 
                    fillOpacity: showHealthGradient ? 0.6 : 0.4 
                }}
                eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onFarmClick(f); }}}
            >
                <Popup className="leaflet-popup-dark">
                    <div className="p-2 min-w-[140px]">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{f.name || `Farm ${f.id}`}</h3>
                        <div className="mt-1 flex flex-col gap-1">
                            <span className="text-xs text-gray-600">Status: <span className="font-semibold capitalize" style={{ color: getStatusColor(f.status) }}>{f.status}</span></span>
                            {f.confidence && <span className="text-xs text-gray-600">Confidence: <span className="font-bold">{(f.confidence * 100).toFixed(0)}%</span></span>}
                            {f.yield && <span className="text-xs mt-1 pt-1 border-t border-gray-200">Yield: <span className="font-bold text-green-700">{f.yield.toFixed(1)} t/ha</span></span>}
                        </div>
                    </div>
                </Popup>
            </Polygon>
        );
      })}
    </>
  );
};

// @ts-nocheck
import React, { useState } from 'react';
import { CircleMarker, Polyline, Marker, Tooltip, useMapEvents } from '@/app/shims/react-leaflet';
import L from '@/app/shims/leaflet';
import * as turf from '@turf/helpers';
import turfArea from '@turf/area';

interface DrawControllerProps {
  isActive: boolean;
  onStatsUpdate: (count: number, area: number) => void;
  drawPoints: L.LatLng[];
  setDrawPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  onFinish: () => void;
}

export const DrawController: React.FC<DrawControllerProps> = ({ 
  isActive, 
  onStatsUpdate, 
  drawPoints, 
  setDrawPoints, 
  onFinish 
}) => {
  const [cursorPos, setCursorPos] = useState<L.LatLng | null>(null);

  useMapEvents({
    click(e) {
      if (!isActive) return;
      
      const newPoint = e.latlng;
      setDrawPoints(prev => {
        const newPoints = [...prev, newPoint];
        if (newPoints.length >= 3) {
           try {
             const ring = newPoints.map(p => [p.lng, p.lat]);
             ring.push([newPoints[0].lng, newPoints[0].lat]);
             const poly = turf.polygon([ring]);
             const areaSqM = turfArea(poly);
             onStatsUpdate(newPoints.length, areaSqM / 10000);
           } catch (err) { /* ignore */ }
        } else {
            onStatsUpdate(newPoints.length, 0);
        }
        return newPoints;
      });
    },
    mousemove(e) {
      if (!isActive) return;
      setCursorPos(e.latlng);
    }
  });

  if (!isActive) return null;

  const canFinish = drawPoints.length >= 3;

  return (
    <>
      {drawPoints.map((pos, idx) => {
        const isStartPoint = idx === 0;
        const isFinishable = isStartPoint && canFinish;

        return (
          <CircleMarker 
            key={`v-${idx}`} 
            center={pos} 
            radius={isFinishable ? 8 : 5} 
            pathOptions={{ 
                color: isFinishable ? '#10b981' : '#ffffff', 
                fillColor: '#000000', 
                fillOpacity: 1, 
                weight: 2 
            }}
            eventHandlers={{
                click: (e) => {
                    if (isFinishable) {
                        L.DomEvent.stopPropagation(e);
                        onFinish();
                    }
                },
                mouseover: (e) => {
                   if (isFinishable) e.target.openTooltip();
                }
            }}
          >
            {isFinishable && (
                <Tooltip direction="top" offset={[0, -10]} opacity={1} className="font-bold text-emerald-600">
                    Click to Finish
                </Tooltip>
            )}
          </CircleMarker>
        );
      })}
      
      {drawPoints.length > 0 && <Polyline positions={drawPoints} pathOptions={{ color: '#fbbf24', weight: 3, dashArray: '5, 5' }} />}
      
      {cursorPos && drawPoints.length > 0 && (
        <Polyline positions={[drawPoints[drawPoints.length - 1], cursorPos]} pathOptions={{ color: '#ffffff', weight: 1, opacity: 0.5, dashArray: '5, 10' }} />
      )}
      
      {/* Visual guide to closing the loop */}
      {cursorPos && drawPoints.length >= 2 && (
         <Polyline positions={[cursorPos, drawPoints[0]]} pathOptions={{ color: canFinish ? '#10b981' : '#ffffff', weight: 2, opacity: canFinish ? 0.8 : 0.2, dashArray: canFinish ? undefined : '5, 5' }} />
      )}

      {/* Cursor Tip */}
      {cursorPos && (
        <Marker 
            position={cursorPos} 
            opacity={0} 
            interactive={false}
        >
            <Tooltip permanent direction="right" offset={[10, 0]} className="bg-black/80 text-white border-0 text-[10px] px-2 py-1">
                {canFinish ? "Click start to finish" : "Click to add point"}
            </Tooltip>
        </Marker>
      )}
    </>
  );
};

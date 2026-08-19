// @ts-nocheck
import React from 'react';
import { Polygon, Marker } from '@/app/shims/react-leaflet';
import L from '@/app/shims/leaflet';
import * as turf from '@turf/helpers';
import turfArea from '@turf/area';

const vertexIcon = L.divIcon({
  className: 'vertex-icon',
  html: `<div style="background-color: white; border: 2px solid black; width: 12px; height: 12px; border-radius: 50%; cursor: grab; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

interface EditControllerProps {
  isActive: boolean;
  points: L.LatLng[];
  setPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  onStatsUpdate: (count: number, area: number) => void;
}

export const EditController: React.FC<EditControllerProps> = ({ 
  isActive, 
  points, 
  setPoints, 
  onStatsUpdate 
}) => {
  if (!isActive || points.length === 0) return null;

  const eventHandlers = (index: number) => ({
    drag(e: L.LeafletEvent) {
      const marker = e.target;
      const position = marker.getLatLng();
      setPoints(prev => {
        const next = [...prev];
        next[index] = position;
        if (next.length >= 3) {
           try {
             const ring = next.map(p => [p.lng, p.lat]);
             ring.push([next[0].lng, next[0].lat]);
             const poly = turf.polygon([ring]);
             const areaSqM = turfArea(poly);
             onStatsUpdate(next.length, areaSqM / 10000);
           } catch (err) { /* ignore */ }
        }
        return next;
      });
    }
  });

  return (
    <>
      <Polygon positions={points} pathOptions={{ color: '#fbbf24', weight: 2, dashArray: '5, 5', fillColor: '#fbbf24', fillOpacity: 0.1 }} />
      {points.map((pos, idx) => (
        <Marker key={`handle-${idx}`} position={pos} icon={vertexIcon} draggable={true} eventHandlers={eventHandlers(idx)} />
      ))}
    </>
  );
};

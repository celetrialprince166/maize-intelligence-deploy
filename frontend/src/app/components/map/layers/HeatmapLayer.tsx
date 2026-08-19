import React from 'react';
import { CircleMarker } from '@/app/shims/react-leaflet';
import L from '@/app/shims/leaflet';

interface HeatmapLayerProps {
  data: Array<{ lat: number; lng: number; weight: number }>;
}

export const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ data }) => {
  return (
    <>
      {data.map((point, idx) => (
        <CircleMarker
          key={`hm-${idx}`}
          center={[point.lat, point.lng]}
          radius={8 * point.weight + 2}
          pathOptions={{ stroke: false, fillColor: point.weight > 0.6 ? '#ef4444' : point.weight > 0.3 ? '#eab308' : '#3b82f6', fillOpacity: 0.5 }}
          eventHandlers={{ click: (e) => L.DomEvent.stopPropagation(e) }}
        />
      ))}
    </>
  );
};

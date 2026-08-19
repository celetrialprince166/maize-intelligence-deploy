// @ts-nocheck
import React from 'react';
import { Polygon, Tooltip } from '@/app/shims/react-leaflet';
import L from '@/app/shims/leaflet';
import { District } from '@/app/services/storage';
import { MapStyle } from '@/app/components/ui/ToolsPanel';

interface DistrictLayerProps {
  districts: District[];
  mapStyle: MapStyle;
  onDistrictClick: (data: District) => void;
}

export const DistrictLayer: React.FC<DistrictLayerProps> = ({ districts, mapStyle, onDistrictClick }) => {
  return (
    <>
      {districts.map(d => (
        <Polygon 
          key={d.id}
          positions={d.coordinates as L.LatLngExpression[]}
          pathOptions={{ color: mapStyle === 'light' ? '#333' : 'white', weight: 1.5, fillColor: 'transparent', opacity: 0.6, dashArray: '5, 5' }}
          eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onDistrictClick(d); }}}
        >
           <Tooltip sticky direction="top" className="bg-black/80 text-white border-0 text-xs">{d.name} District</Tooltip>
        </Polygon>
      ))}
    </>
  );
};

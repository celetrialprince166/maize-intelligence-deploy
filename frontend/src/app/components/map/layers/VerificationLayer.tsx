import React from 'react';
import { CircleMarker, Tooltip } from '@/app/shims/react-leaflet';
import L from '@/app/shims/leaflet';
import { Farm } from '@/app/services/storage';
import { getStatusColor } from '../utils';

interface VerificationLayerProps {
  farms: Farm[];
  onFarmClick: (data: Farm) => void;
}

export const VerificationLayer: React.FC<VerificationLayerProps> = ({ farms, onFarmClick }) => {
  const verificationFarms = farms.filter(f => ['verified', 'pending', 'flagged'].includes(f.status));

  return (
    <>
      {verificationFarms.map(f => (
        <CircleMarker 
            key={`pt-${f.id}`}
            center={f.center} 
            radius={6} 
            pathOptions={{ 
                fillColor: getStatusColor(f.status), 
                fillOpacity: 0.9, 
                weight: 2, 
                stroke: true, 
                color: 'white' 
            }} 
            eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onFarmClick(f); }}}
        >
           <Tooltip direction="top" offset={[0, -10]} opacity={1}>{f.status.toUpperCase()}</Tooltip>
        </CircleMarker>
      ))}
    </>
  );
};

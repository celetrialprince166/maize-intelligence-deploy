// @ts-nocheck
import React, { useEffect } from 'react';
import { useMap } from '@/app/shims/react-leaflet';

interface MapViewControllerProps {
  center: [number, number];
  zoom: number;
  isInteractive: boolean;
  isVisible: boolean;
}

export const MapViewController: React.FC<MapViewControllerProps> = ({ 
  center, 
  zoom, 
  isInteractive, 
  isVisible 
}) => {
  const map = useMap();
  
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        map.invalidateSize({ animate: false });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible, map]);

  useEffect(() => {
    const [lat, lng] = center || [];
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const timeoutId = setTimeout(() => {
        map.invalidateSize({ animate: false });
        if (isVisible) {
           map.setView([lat, lng], zoom, { animate: true, duration: 1.5 });
        } else {
           map.setView([lat, lng], zoom, { animate: false });
        }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [center, zoom, map, isVisible]);

  useEffect(() => {
    if (isInteractive) {
        map.doubleClickZoom.disable();
    } else {
        map.getContainer().style.cursor = '';
        map.doubleClickZoom.enable();
    }
  }, [isInteractive, map]);

  return null;
};

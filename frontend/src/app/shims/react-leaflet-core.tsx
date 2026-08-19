// @react-leaflet/core shim for build compatibility
import React from 'react';

// Export all the internal hooks and utilities that @react-leaflet/core provides
export const createElementHook = () => () => null;
export const createControlHook = () => () => null;
export const createLayerHook = () => () => null;
export const createPathHook = () => () => null;
export const createTileLayerHook = () => () => null;
export const createContainerComponent = () => () => null;
export const createDivOverlayHook = () => () => null;
export const createLeafComponent = () => () => null;

export const useLeafletContext = () => ({
  map: {
    setView: () => {},
    fitBounds: () => {},
    getZoom: () => 10,
    getCenter: () => ({ lat: 0, lng: 0 }),
    on: () => {},
    off: () => {},
  },
});

export const LeafletProvider: React.FC<any> = ({ children }) => <>{children}</>;
export const LeafletConsumer: React.FC<any> = ({ children }) => <>{children}</>;

// Export everything as default as well
export default {
  createElementHook,
  createControlHook,
  createLayerHook,
  createPathHook,
  createTileLayerHook,
  createContainerComponent,
  createDivOverlayHook,
  createLeafComponent,
  useLeafletContext,
  LeafletProvider,
  LeafletConsumer,
};

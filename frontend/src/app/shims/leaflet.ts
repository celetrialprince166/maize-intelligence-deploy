// Leaflet shim for build compatibility
// This provides type-compatible stubs since leaflet package won't install in this environment

export interface LatLngExpression {
  lat: number;
  lng: number;
}

export interface LatLngBoundsExpression {
  _southWest: LatLngExpression;
  _northEast: LatLngExpression;
}

export class Icon {
  static Default = {
    prototype: {
      _getIconUrl: null,
    },
    mergeOptions: (options: any) => {
      // No-op stub for icon options
    },
  };
  
  constructor(options: any) {}
}

export class DivIcon extends Icon {
  constructor(options: any) {
    super(options);
  }
}

export class LatLng {
  lat: number;
  lng: number;
  
  constructor(lat: number, lng: number) {
    this.lat = lat;
    this.lng = lng;
  }
}

export class LatLngBounds {
  _southWest: LatLng;
  _northEast: LatLng;
  
  constructor(corner1: LatLngExpression, corner2: LatLngExpression) {
    this._southWest = new LatLng(corner1.lat, corner1.lng);
    this._northEast = new LatLng(corner2.lat, corner2.lng);
  }
  
  extend(latlng: LatLngExpression) {
    return this;
  }
}

export function latLng(lat: number, lng: number): LatLng {
  return new LatLng(lat, lng);
}

export function latLngBounds(corner1: LatLngExpression, corner2: LatLngExpression): LatLngBounds {
  return new LatLngBounds(corner1, corner2);
}

export function divIcon(options: any): DivIcon {
  return new DivIcon(options);
}

export function icon(options: any): Icon {
  return new Icon(options);
}

// Stub Map class
export class Map {
  _container: any = {};
  constructor(_el: any, _options?: any) {}
  getContainer() { return this._container; }
  setView(_center: any, _zoom?: number, _options?: any) { return this; }
  fitBounds(_bounds: any, _options?: any) { return this; }
  flyTo(_latlng: any, _zoom?: number, _options?: any) { return this; }
  on(_event: string, _handler: any) { return this; }
  off(_event: string, _handler: any) { return this; }
  remove() {}
}

// Stub DomEvent
export const DomEvent = {
  stopPropagation: (_e: any) => {},
  preventDefault: (_e: any) => {},
  disableClickPropagation: (_el: any) => {},
  disableScrollPropagation: (_el: any) => {},
};

// Default export
const L = {
  Icon,
  DivIcon,
  LatLng,
  LatLngBounds,
  Map,
  DomEvent,
  latLng,
  latLngBounds,
  divIcon,
  icon,
};

export default L;

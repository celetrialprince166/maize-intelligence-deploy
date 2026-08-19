/**
 * DataService — server-backed farm storage via DynamoDB.
 *
 * All farm data is fetched from / persisted to the backend API.
 * localStorage is no longer used for farm data (server is source of truth).
 * Districts remain as local seed data (shared, not user-specific).
 */
import type { TimeSeries, PixelGrid, AncillaryData, FarmComparison } from './api';
import { FarmAPI, type FarmRecord } from './api';

export interface District {
  id: string;
  name: string;
  coordinates: [number, number][];
}

export interface FarmAnalysis {
  year: number;
  status: 'maize' | 'non-maize' | 'verified' | 'pending' | 'rejected' | 'flagged';
  yield?: number;
  confidence?: number;
  area?: number;
  time_series?: TimeSeries[];
  pixel_grid?: PixelGrid;
  ancillary?: AncillaryData;
  comparison?: FarmComparison;
}

export interface Farm {
  id: string;
  name?: string;
  status: 'maize' | 'non-maize' | 'verified' | 'pending' | 'rejected' | 'flagged';
  yield?: number;
  area?: number;
  coordinates?: [number, number][];
  center: [number, number];
  confidence?: number;
  year?: number;
  analyses?: Record<number, FarmAnalysis>;
  hasDataForSeason?: boolean;
}

// Seed districts — fallback when API is unreachable
const SEED_DISTRICTS: District[] = [
  {
    id: 'dist-01',
    name: 'Tamale Metropolitan',
    coordinates: [[9.35, -0.90], [9.35, -0.75], [9.50, -0.75], [9.50, -0.90]],
  },
  {
    id: 'dist-02',
    name: 'Nanton',
    coordinates: [[9.50, -0.85], [9.50, -0.70], [9.65, -0.70], [9.65, -0.85]],
  },
  {
    id: 'dist-03',
    name: 'Gushegu',
    coordinates: [[9.70, -0.55], [9.70, -0.35], [9.90, -0.35], [9.90, -0.55]],
  },
];


// ---------------------------------------------------------------------------
// Convert between API FarmRecord and frontend Farm
// ---------------------------------------------------------------------------

function recordToFarm(r: FarmRecord): Farm {
  // Parse analyses map — backend stores year keys as strings
  let analyses: Record<number, FarmAnalysis> | undefined;
  if (r.analyses) {
    analyses = {};
    for (const [key, val] of Object.entries(r.analyses)) {
      const yr = Number(key);
      if (!isNaN(yr)) analyses[yr] = val as FarmAnalysis;
    }
  }

  // Derive flat status/yield/confidence from the primary year's analysis
  const primaryYear = r.year || new Date().getFullYear();
  const primaryAnalysis = analyses?.[primaryYear];

  return {
    id: r.farmId,
    name: r.name,
    status: (primaryAnalysis?.status || r.status || 'pending') as Farm['status'],
    yield: primaryAnalysis?.yield ?? r.yield,
    area: primaryAnalysis?.area ?? r.area,
    coordinates: r.coordinates as [number, number][] | undefined,
    center: (r.center || [0, 0]) as [number, number],
    confidence: primaryAnalysis?.confidence ?? r.confidence,
    year: r.year,
    analyses,
  };
}

// In-memory cache of farms (refreshed on init / mutations)
let _cachedFarms: Farm[] = [];
let _cachedDistricts: District[] = [];

export const DataService = {
  /**
   * Fetch all farms from the server. Call after login.
   */
  async init(): Promise<void> {
    try {
      const records = await FarmAPI.listFarms();
      _cachedFarms = records.map(recordToFarm);
    } catch (err: any) {
      console.error('DataService.init failed:', err);
      _cachedFarms = [];
      if (err.message?.includes('401')) throw err; // Let caller handle auth redirect
    }
  },

  /**
   * Return cached farms (call init() first).
   */
  getFarms(): Farm[] {
    return _cachedFarms;
  },

  /**
   * Create a new farm via the API.
   */
  async addFarm(farm: Omit<Farm, 'id'>): Promise<Farm> {
    const payload = {
      name: farm.name,
      status: farm.status || 'pending',
      yield: farm.yield,
      area: farm.area,
      coordinates: farm.coordinates as number[][],
      center: farm.center as number[],
      confidence: farm.confidence,
      year: farm.year || new Date().getFullYear(),
      analyses: farm.analyses as Record<string, any> | undefined,
    };
    const record = await FarmAPI.createFarm(payload);
    const newFarm = recordToFarm(record);
    _cachedFarms = [..._cachedFarms, newFarm];
    return newFarm;
  },


  /**
   * Update a farm (status, name, etc.) via the API.
   */
  async updateFarm(id: string, updates: Partial<Farm>): Promise<Farm | null> {
    try {
      const payload: Record<string, any> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.yield !== undefined) payload.yield = updates.yield;
      if (updates.area !== undefined) payload.area = updates.area;
      if (updates.coordinates !== undefined) payload.coordinates = updates.coordinates;
      if (updates.center !== undefined) payload.center = updates.center;
      if (updates.confidence !== undefined) payload.confidence = updates.confidence;
      if (updates.year !== undefined) payload.year = updates.year;
      if (updates.analyses !== undefined) payload.analyses = updates.analyses;

      const record = await FarmAPI.updateFarm(id, payload);
      const updated = recordToFarm(record);
      _cachedFarms = _cachedFarms.map(f => (f.id === id ? updated : f));
      return updated;
    } catch {
      return null;
    }
  },

  /**
   * Convenience: update just the status field.
   */
  async updateFarmStatus(id: string, status: Farm['status']): Promise<Farm | null> {
    return DataService.updateFarm(id, { status });
  },

  /**
   * Store or merge per-season analysis data for a farm.
   */
  async updateFarmAnalysis(
    farmId: string,
    year: number,
    analysis: Partial<FarmAnalysis>,
  ): Promise<Farm | null> {
    const farm = _cachedFarms.find(f => f.id === farmId);
    if (!farm) return null;

    const existing = farm.analyses?.[year] ?? { year, status: farm.status };
    const merged: FarmAnalysis = { ...existing, ...analysis, year };

    // Build the full analyses map with the updated year
    const allAnalyses = { ...(farm.analyses ?? {}), [year]: merged };

    // Also update flat fields if this is the primary year
    const updates: Partial<Farm> & { analyses: Record<number, FarmAnalysis> } = { analyses: allAnalyses };
    if (year === farm.year) {
      if (merged.status) updates.status = merged.status;
      if (merged.yield !== undefined) updates.yield = merged.yield;
      if (merged.confidence !== undefined) updates.confidence = merged.confidence;
      if (merged.area !== undefined) updates.area = merged.area;
    }

    return DataService.updateFarm(farmId, updates);
  },

  /** Look up per-season analysis data for a specific year */
  getFarmAnalysis(farm: Farm, year: number): FarmAnalysis | undefined {
    return farm.analyses?.[year];
  },

  /**
   * Delete a farm via the API.
   */
  async deleteFarm(id: string): Promise<void> {
    await FarmAPI.deleteFarm(id);
    _cachedFarms = _cachedFarms.filter(f => f.id !== id);
  },


  /**
   * Import a GeoJSON FeatureCollection — creates one farm per feature.
   */
  async importGeoJSON(geojson: any, year: number = new Date().getFullYear()): Promise<Farm[]> {
    const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
    const newFarms: Farm[] = [];

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      if (!feature.geometry || !feature.geometry.coordinates) continue;

      let coords: [number, number][] = [];
      let center: [number, number] = [0, 0];

      if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        coords = ring.map((c: any) => [c[1], c[0]] as [number, number]);
        const latSum = coords.reduce((sum, c) => sum + c[0], 0);
        const lngSum = coords.reduce((sum, c) => sum + c[1], 0);
        center = [latSum / coords.length, lngSum / coords.length];
      } else if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        center = [lat, lng];
        const size = 0.005;
        coords = [
          [lat - size, lng - size],
          [lat - size, lng + size],
          [lat + size, lng + size],
          [lat + size, lng - size],
        ];
      }

      if (coords.length > 0) {
        try {
          const farm = await DataService.addFarm({
            name: feature.properties?.name || `Imported Farm ${i + 1}`,
            status: 'pending',
            yield: feature.properties?.yield,
            area: feature.properties?.area,
            center,
            coordinates: coords,
            confidence: feature.properties?.confidence,
            year: feature.properties?.year || year,
          });
          newFarms.push(farm);
        } catch (err) {
          console.error(`Failed to import farm ${i + 1}:`, err);
        }
      }
    }

    if (newFarms.length === 0) throw new Error('No valid geometries found in file');
    return newFarms;
  },

  /**
   * Get district data — fetches from GEE if available, falls back to seed data.
   */
  getDistricts(): District[] {
    return _cachedDistricts.length > 0 ? _cachedDistricts : SEED_DISTRICTS;
  },

  /**
   * Load real boundaries from the backend (GEE geoBoundaries).
   */
  async loadBoundaries(): Promise<{ regions: District[]; districts: District[] }> {
    try {
      const [regions, districts] = await Promise.all([
        FarmAPI.getRegionBoundaries(),
        FarmAPI.getDistrictBoundaries(),
      ]);
      if (districts.length > 0) {
        _cachedDistricts = districts.map(d => ({
          id: d.id,
          name: d.name,
          coordinates: d.coordinates as [number, number][],
        }));
      }
      return {
        regions: regions.map(r => ({ id: r.id, name: r.name, coordinates: r.coordinates as [number, number][] })),
        districts: _cachedDistricts.length > 0 ? _cachedDistricts : SEED_DISTRICTS,
      };
    } catch {
      return { regions: [], districts: SEED_DISTRICTS };
    }
  },

  /**
   * Refresh farms from the server (re-fetch).
   */
  async refresh(): Promise<Farm[]> {
    await DataService.init();
    return _cachedFarms;
  },

  /** Clear the local cache without touching the server. */
  clearLocalCache(): void {
    _cachedFarms = [];
  },
};

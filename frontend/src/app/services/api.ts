/**
 * Maize Intelligence API client.
 * Connects the frontend to the backend analysis service.
 */

import { getIdToken, clearAuth } from './auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface AnalyzeRequest {
  geometry: GeoJSON.Geometry;
  name?: string;
  days_back?: number;
  season_year?: number;
  farm_id?: string;  // If provided + auth, stores results in farm record
}

export interface AnalyzeResult {
  classification: string;
  confidence: number;
  is_maize: boolean;
  yield_mt_ha: number | null;
  health_status: string | null;
  indices: { ndvi: number; evi: number; ndmi: number };
  satellite_date: string | null;
  area_ha: number | null;
}

// --- Enriched response interfaces (Requirements 4.1–4.5) ---

export interface TimeSeries {
  date: string;
  ndvi: number;
  evi: number;
  ndmi: number;
  gcvi: number;
  ndre: number;
}

export interface PixelGrid {
  ndvi_grid: number[][];
  bbox: [number, number, number, number];
  resolution_m: number;
  rows: number;
  cols: number;
}

export interface AncillaryData {
  elevation: number;
  slope: number;
  precip: number;
  temp_max: number;
  SOC: number;
  sources: Record<string, string>;
  warnings: string[];
}

export interface FarmComparison {
  district_avg_yield: number;
  district_avg_ndvi: number;
  yield_percentile: number;
  ndvi_delta: number;
}

export interface ModelQuality {
  r2: number;
  rmse: number;
  sample_count: number;
}

export interface EnrichedAnalyzeResult extends AnalyzeResult {
  time_series: TimeSeries[];
  time_series_warning?: string;
  pixel_grid?: PixelGrid;
  pixel_grid_warning?: string;
  ancillary: AncillaryData;
  comparison: FarmComparison;
  model_quality: ModelQuality;
  true_color_thumbnail?: string;
}

// --- District summary interface (Requirement 5.1) ---

export interface DistrictSummaryResult {
  district_id: string;
  district_name: string;
  avg_yield: number;
  avg_ndvi: number;
  farm_count: number;
  total_area_ha: number;
}

export interface BatchResult {
  results: (EnrichedAnalyzeResult & { index: number; name: string })[];
  errors: { index: number; name: string; error: string }[];
  total: number;
  success: number;
}

export const MaizeAPI = {
  /** Health check */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Analyze a single farm polygon */
  async analyze(request: AnalyzeRequest, signal?: AbortSignal): Promise<EnrichedAnalyzeResult> {
    // Try sync first (works locally), fall back to async polling (for deployed Lambda)
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
      if (res.status === 503 || res.status === 504) {
        // API Gateway timeout — use async endpoint
        return MaizeAPI.analyzeAsync(request, signal);
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Analysis failed' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      // Network error or timeout — try async
      if (err.message?.includes('Failed to fetch') || err.message?.includes('timeout')) {
        return MaizeAPI.analyzeAsync(request, signal);
      }
      throw err;
    }
  },

  /** Async analyze with polling (for deployed Lambda behind API Gateway) */
  async analyzeAsync(request: AnalyzeRequest, signal?: AbortSignal): Promise<EnrichedAnalyzeResult> {
    // Notify the UI about the timeout/async fallback
    window.dispatchEvent(new CustomEvent('maize-api-timeout', { detail: { message: 'Server processing is slow. Switching to background mode...' } }));

    // Start the job
    const startRes = await fetch(`${API_BASE}/analyze/async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({ detail: 'Failed to start analysis' }));
      throw new Error(err.detail || `HTTP ${startRes.status}`);
    }
    const { job_id } = await startRes.json();

    // Poll for results
    for (let i = 0; i < 60; i++) { // max 5 minutes (60 * 5s)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await new Promise(r => setTimeout(r, 5000)); // poll every 5s

      const statusRes = await fetch(`${API_BASE}/analyze/status/${job_id}`, { signal });
      if (!statusRes.ok) continue;
      const job = await statusRes.json();

      if (job.status === 'complete' && job.result) {
        return job.result as EnrichedAnalyzeResult;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || 'Analysis failed');
      }
    }
    throw new Error('Analysis timed out after 5 minutes');
  },

  /** Analyze multiple farm polygons (for file uploads) */
  async analyzeBatch(requests: AnalyzeRequest[]): Promise<BatchResult> {
    const res = await fetch(`${API_BASE}/analyze/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requests),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Batch analysis failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Get district-level aggregated summary (Requirement 5.1) */
  async getDistrictSummary(): Promise<DistrictSummaryResult[]> {
    const res = await fetch(`${API_BASE}/districts/summary`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch district summary' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Convert a GeoJSON FeatureCollection into AnalyzeRequests */
  geojsonToRequests(geojson: any): AnalyzeRequest[] {
    const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
    return features
      .filter((f: any) => f.geometry && f.geometry.coordinates)
      .map((f: any, i: number) => ({
        geometry: f.geometry,
        name: f.properties?.name || `Farm ${i + 1}`,
      }));
  },

  /** Get GEE classification map tile URL */
  async getClassificationMap(geometry: GeoJSON.Geometry, year: number): Promise<{ tile_url: string; legend: { label: string; color: string }[] }> {
    const res = await fetch(`${API_BASE}/map/classification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometry, year }),
    });
    if (!res.ok) throw new Error('Failed to get classification map');
    return res.json();
  },

  /** Get GEE yield map tile URL */
  async getYieldMap(geometry: GeoJSON.Geometry, year: number): Promise<{ tile_url: string; min: number; max: number; unit: string; palette: string[] }> {
    const res = await fetch(`${API_BASE}/map/yield`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometry, year }),
    });
    if (!res.ok) throw new Error('Failed to get yield map');
    return res.json();
  },

  /** Convert drawn points [lat, lng][] to a GeoJSON Polygon geometry */
  pointsToGeometry(points: { lat: number; lng: number }[]): GeoJSON.Geometry {
    // Close the ring
    const coords = points.map(p => [p.lng, p.lat]);
    if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
      coords.push([...coords[0]]);
    }
    return { type: 'Polygon', coordinates: [coords] };
  },
};

// ---------------------------------------------------------------------------
// Authenticated helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleAuthResponse(res: Response) {
  if (res.status === 401) {
    clearAuth();
    window.location.reload();
    throw new Error('Session expired — please log in again');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Farm CRUD API
// ---------------------------------------------------------------------------

export interface FarmCreatePayload {
  name?: string;
  status?: string;
  yield?: number;
  area?: number;
  coordinates: number[][];
  center?: number[];
  confidence?: number;
  year?: number;
  analyses?: Record<string, any>;
}

export interface FarmUpdatePayload {
  name?: string;
  status?: string;
  yield?: number;
  area?: number;
  coordinates?: number[][];
  center?: number[];
  confidence?: number;
  year?: number;
  analyses?: Record<string, any>;
}

export interface FarmRecord {
  farmId: string;
  userId: string;
  name?: string;
  status: string;
  yield?: number;
  area?: number;
  coordinates?: number[][];
  center: number[];
  confidence?: number;
  year?: number;
  analyses?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DistrictRecord {
  id: string;
  name: string;
  coordinates: number[][];
}

export const FarmAPI = {
  async createFarm(farm: FarmCreatePayload): Promise<FarmRecord> {
    const res = await fetch(`${API_BASE}/farms/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(farm),
    });
    return handleAuthResponse(res);
  },

  async listFarms(): Promise<FarmRecord[]> {
    const res = await fetch(`${API_BASE}/farms/`, { headers: authHeaders() });
    return handleAuthResponse(res);
  },

  async getFarm(farmId: string): Promise<FarmRecord> {
    const res = await fetch(`${API_BASE}/farms/${farmId}`, { headers: authHeaders() });
    return handleAuthResponse(res);
  },

  async updateFarm(farmId: string, updates: FarmUpdatePayload): Promise<FarmRecord> {
    const res = await fetch(`${API_BASE}/farms/${farmId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates),
    });
    return handleAuthResponse(res);
  },

  async deleteFarm(farmId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/farms/${farmId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await handleAuthResponse(res);
  },

  async batchDeleteFarms(farmIds: string[]): Promise<{ deleted: string[]; failed: string[]; count: number }> {
    const res = await fetch(`${API_BASE}/farms/batch-delete`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ farm_ids: farmIds }),
    });
    return handleAuthResponse(res);
  },

  async getDistricts(): Promise<DistrictRecord[]> {
    const res = await fetch(`${API_BASE}/districts`, { headers: authHeaders() });
    return handleAuthResponse(res);
  },

  async getRegionBoundaries(): Promise<{ id: string; name: string; coordinates: number[][] }[]> {
    const res = await fetch(`${API_BASE}/boundaries/regions`);
    if (!res.ok) return [];
    return res.json();
  },

  async getDistrictBoundaries(): Promise<{ id: string; name: string; coordinates: number[][] }[]> {
    const res = await fetch(`${API_BASE}/boundaries/districts`);
    if (!res.ok) return [];
    return res.json();
  },
};

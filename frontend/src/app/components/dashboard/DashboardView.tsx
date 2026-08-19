import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { 
  Download, Calendar, TrendingUp, Sprout, Map, CheckCircle2, 
  Satellite, Target, AlertTriangle, ArrowRight, Search
} from 'lucide-react';
import { Farm } from '@/app/services/storage';
import { DataService } from '@/app/services/storage';
import { MaizeAPI } from '@/app/services/api';

const COLORS = {
  maize: '#10b981', // emerald-500
  verified: '#3b82f6', // blue-500
  pending: '#eab308', // yellow-500
  rejected: '#ef4444', // red-500
  flagged: '#f97316', // orange-500
};

interface DashboardViewProps {
  farms: Farm[];
  mode?: 'global' | 'analysis';
  selectedFarm?: Farm | null;
  activeSeason?: number;
  onSwitchToGlobal?: () => void;
  onSwitchToAnalysis?: () => void;
  onClearSelection?: () => void;
  onSelectFarm?: (farm: Farm) => void;
}

// --- GEE Map Panel for farm detail view ---
const GeeMapPanel: React.FC<{ farm: Farm; year: number }> = ({ farm, year }) => {
  const [classificationTiles, setClassificationTiles] = useState<{ tile_url: string; legend: { label: string; color: string }[] } | null>(null);
  const [yieldTiles, setYieldTiles] = useState<{ tile_url: string; min: number; max: number; palette: string[] } | null>(null);
  const [activeLayer, setActiveLayer] = useState<'classification' | 'yield'>('classification');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const loadMapTiles = async (layer: 'classification' | 'yield') => {
    if (!farm.coordinates || farm.coordinates.length < 3) return;

    const coords = farm.coordinates.map(c => [c[1], c[0]]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push([...coords[0]]);
    }
    const geometry = { type: 'Polygon' as const, coordinates: [coords] };

    setLoading(true);
    setError(null);
    try {
      if (layer === 'classification') {
        const result = await MaizeAPI.getClassificationMap(geometry, year);
        setClassificationTiles(result);
        addGeeLayer(result.tile_url);
      } else {
        const result = await MaizeAPI.getYieldMap(geometry, year);
        setYieldTiles(result);
        addGeeLayer(result.tile_url);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load map');
    } finally {
      setLoading(false);
    }
  };

  // When switching tabs, apply already-loaded tiles to the map
  useEffect(() => {
    if (activeLayer === 'classification' && classificationTiles) {
      addGeeLayer(classificationTiles.tile_url);
    } else if (activeLayer === 'yield' && yieldTiles) {
      addGeeLayer(yieldTiles.tile_url);
    }
  }, [activeLayer]);

  const addGeeLayer = (tileUrl: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Wait for style to be loaded
    const apply = () => {
      if (map.getLayer('gee-tiles')) map.removeLayer('gee-tiles');
      if (map.getSource('gee-tiles')) map.removeSource('gee-tiles');

      map.addSource('gee-tiles', {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
      });
      map.addLayer({
        id: 'gee-tiles',
        type: 'raster',
        source: 'gee-tiles',
        paint: { 'raster-opacity': 0.85 },
      });

      // Re-add boundary on top
      if (map.getLayer('farm-boundary-line')) map.moveLayer('farm-boundary-line');
      if (map.getLayer('farm-boundary-fill')) map.moveLayer('farm-boundary-fill');
    };

    if (map.isStyleLoaded()) apply();
    else map.once('style.load', apply);
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const mb = await import('mapbox-gl');
      await import('mapbox-gl/dist/mapbox-gl.css');

      // No token = no Mapbox tiles until VITE_MAPBOX_TOKEN is set — see .env.example.
      mb.default.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";
      mb.default.baseApiUrl = "https://localhost:9999";

      const map = new mb.default.Map({
        container: mapContainerRef.current!,
        style: {
          version: 8 as const,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            basemap: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
            },
          },
          layers: [{ id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 19 }],
        },
        center: [farm.center[1], farm.center[0]],
        zoom: 14,
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      map.on('load', () => {
        // Add farm boundary
        if (farm.coordinates && farm.coordinates.length >= 3) {
          const coords = farm.coordinates.map(c => [c[1], c[0]]);
          if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([...coords[0]]);
          }
          map.addSource('farm-boundary', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } },
          });
          map.addLayer({
            id: 'farm-boundary-fill',
            type: 'fill',
            source: 'farm-boundary',
            paint: { 'fill-color': '#10b981', 'fill-opacity': 0.1 },
          });
          map.addLayer({
            id: 'farm-boundary-line',
            type: 'line',
            source: 'farm-boundary',
            paint: { 'line-color': '#10b981', 'line-width': 2 },
          });
        }
      });
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [farm]);

  return (
    <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl mb-6">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-sm uppercase tracking-wider font-medium text-white/60">GEE Classification & Yield Map</h3>
          <p className="text-xs text-white/40">Sentinel-2 derived land cover and yield prediction via Google Earth Engine</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveLayer('classification')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              activeLayer === 'classification' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
            }`}
          >
            Classification
          </button>
          <button
            onClick={() => setActiveLayer('yield')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              activeLayer === 'yield' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
            }`}
          >
            Yield Map
          </button>
        </div>
      </div>

      <div className="relative w-full h-80 rounded-lg border border-white/10 overflow-hidden">
        {/* Run button overlay — shows when tiles haven't been loaded for the active layer */}
        {!loading && ((activeLayer === 'classification' && !classificationTiles) || (activeLayer === 'yield' && !yieldTiles)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-[2px]">
            <button
              onClick={() => loadMapTiles(activeLayer)}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-lg shadow-emerald-900/30 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run {activeLayer === 'classification' ? 'Classification' : 'Yield Prediction'}
            </button>
            <p className="text-[10px] text-white/40 mt-2">Processes via Google Earth Engine · 15-30s</p>
          </div>
        )}
        <div ref={mapContainerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-400 bg-black/80 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-3" />
            <p className="text-sm">Running GEE {activeLayer} model...</p>
            <p className="text-[10px] text-white/30 mt-1">This may take 15-30 seconds</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm bg-black/60 z-10">
            {error}
          </div>
        )}

        {/* Legend */}
        {activeLayer === 'classification' && classificationTiles && !loading && (
          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg p-2 border border-white/10 z-20">
            <div className="text-[9px] text-white/50 uppercase mb-1 font-bold">Legend</div>
            {classificationTiles.legend.map(item => (
              <div key={item.label} className="flex items-center gap-2 text-[10px] text-white/80">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        )}

        {activeLayer === 'yield' && yieldTiles && !loading && (
          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg p-2 border border-white/10 z-20">
            <div className="text-[9px] text-white/50 uppercase mb-1 font-bold">Maize Yield (kg/ha)</div>
            <div className="flex items-center gap-0.5">
              {yieldTiles.palette.map((color, i) => (
                <div key={i} className="w-6 h-3" style={{ backgroundColor: color }} />
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-white/40 mt-0.5">
              <span>{yieldTiles.min}</span>
              <span>{yieldTiles.max}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({ farms, mode = 'global', selectedFarm, activeSeason, onSwitchToGlobal, onSwitchToAnalysis, onClearSelection, onSelectFarm }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isChartReady, setIsChartReady] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsChartReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // --- Helper: get best yield/status/confidence from a farm (checks analyses first) ---
  const getFarmYield = (f: Farm): number => {
    if (f.analyses) {
      const years = Object.keys(f.analyses).map(Number).sort((a, b) => b - a);
      for (const yr of years) {
        const a = f.analyses[yr];
        if (a?.yield && a.yield > 0) return a.yield;
      }
    }
    return f.yield || 0;
  };
  const getFarmStatus = (f: Farm): string => {
    if (f.analyses) {
      const years = Object.keys(f.analyses).map(Number).sort((a, b) => b - a);
      for (const yr of years) {
        const a = f.analyses[yr];
        if (a?.status && a.status !== 'pending') return a.status;
      }
    }
    return f.status || 'pending';
  };
  const getFarmConfidence = (f: Farm): number => {
    if (f.analyses) {
      const years = Object.keys(f.analyses).map(Number).sort((a, b) => b - a);
      for (const yr of years) {
        const a = f.analyses[yr];
        if (a?.confidence && a.confidence > 0) return a.confidence;
      }
    }
    return f.confidence || 0;
  };
  const getFarmArea = (f: Farm): number => {
    if (f.analyses) {
      const years = Object.keys(f.analyses).map(Number).sort((a, b) => b - a);
      for (const yr of years) {
        const a = f.analyses[yr];
        if (a?.area && a.area > 0) return a.area;
      }
    }
    return f.area || 0;
  };

  // --- Smart Metrics Calculation ---
  const metrics = useMemo(() => {
    const totalFarms = farms.length;
    const totalArea = farms.reduce((acc, f) => acc + getFarmArea(f), 0);
    const validYieldFarms = farms.filter(f => getFarmYield(f) > 0);
    const avgYield = validYieldFarms.length 
      ? validYieldFarms.reduce((acc, f) => acc + getFarmYield(f), 0) / validYieldFarms.length 
      : 0;
    const verifiedCount = farms.filter(f => {
      const s = getFarmStatus(f);
      return s === 'verified' || s === 'maize';
    }).length;
    const verificationRate = totalFarms ? Math.round((verifiedCount / totalFarms) * 100) : 0;
    const projectedProduction = totalArea * avgYield;

    return { totalFarms, totalArea, avgYield, verificationRate, projectedProduction };
  }, [farms]);

  // --- District assignment helper ---
  const assignDistrict = (farm: Farm): string => {
    const lat = farm.center[0];
    const lng = farm.center[1];
    // Northern Ghana districts (training region)
    if (lat >= 9.70 && lat <= 9.90 && lng >= -0.55 && lng <= -0.35) return 'Gushegu';
    if (lat >= 9.50 && lat <= 9.65 && lng >= -0.85 && lng <= -0.70) return 'Nanton';
    if (lat >= 9.30 && lat <= 9.55 && lng >= -0.95 && lng <= -0.70) return 'Tamale Metropolitan';
    // Broader Ghana regions (outside training area)
    if (lat >= 9.0 && lat <= 11.0) return 'Northern Region';
    if (lat >= 7.5 && lat <= 9.0) return 'Bono / Ashanti Region';
    if (lat >= 6.0 && lat <= 7.5 && lng >= -2.5 && lng <= -0.5) return 'Central / Western Region';
    if (lat >= 5.4 && lat <= 6.2 && lng >= -0.5 && lng <= 0.5) return 'Greater Accra Region';
    if (lat >= 6.0 && lat <= 8.0 && lng >= -0.5 && lng <= 1.5) return 'Volta / Eastern Region';
    if (lat >= 10.0 && lat <= 11.2) return 'Upper East / Upper West';
    return 'Other Region';
  };

  // --- Data-driven Analysis Insights ---
  const insights = useMemo(() => {
    const list = [];
    const REGIONAL_AVG = 2.0; // Northern Ghana regional average t/ha

    // 1. Yield Gap Analysis vs real regional average
    const validYields = farms.map(f => getFarmYield(f)).filter(y => y > 0);
    const yieldGap = REGIONAL_AVG - metrics.avgYield;
    if (validYields.length > 0) {
      if (yieldGap > 0.5) {
        list.push({
          type: 'critical',
          title: 'Yield Gap Detected',
          description: `Average yield (${metrics.avgYield.toFixed(2)} t/ha) is ${yieldGap.toFixed(2)} t/ha below the Northern Ghana regional average of ${REGIONAL_AVG} t/ha.`,
          action: 'Review soil moisture and input availability for underperforming farms.'
        });
      } else if (yieldGap < -0.3) {
        list.push({
          type: 'success',
          title: 'Above-Average Yield Performance',
          description: `Average yield (${metrics.avgYield.toFixed(2)} t/ha) exceeds the regional average of ${REGIONAL_AVG} t/ha by ${Math.abs(yieldGap).toFixed(2)} t/ha.`,
          action: 'Document best practices from top-performing farms.'
        });
      } else {
        list.push({
          type: 'info',
          title: 'Yield Near Regional Average',
          description: `Average yield (${metrics.avgYield.toFixed(2)} t/ha) is close to the Northern Ghana regional average of ${REGIONAL_AVG} t/ha.`,
          action: 'Monitor for seasonal variation.'
        });
      }
    }

    // 2. Anomaly detection: farms > 2σ from mean
    if (validYields.length >= 3) {
      const mean = validYields.reduce((a, b) => a + b, 0) / validYields.length;
      const variance = validYields.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validYields.length;
      const stdDev = Math.sqrt(variance);
      const outliers = farms.filter(f => Math.abs(getFarmYield(f) - mean) > 2 * stdDev && getFarmYield(f) > 0);
      if (outliers.length > 0) {
        list.push({
          type: 'warning',
          title: `${outliers.length} Outlier Farm${outliers.length > 1 ? 's' : ''} Detected`,
          description: `${outliers.map(f => f.name || f.id).join(', ')} ${outliers.length > 1 ? 'have' : 'has'} yield >2σ from the mean (${mean.toFixed(2)} ± ${stdDev.toFixed(2)} t/ha).`,
          action: 'Verify field data and satellite scene quality for these farms.'
        });
      }
    }

    // 3. Operational Velocity
    const pending = farms.filter(f => getFarmStatus(f) === 'pending').length;
    if (pending > 3) {
      list.push({
        type: 'warning',
        title: 'Verification Backlog',
        description: `${pending} farms are pending review.`,
        action: 'Prioritize verification for farms with high confidence scores.'
      });
    }

    return list;
  }, [metrics, farms]);

  // --- Chart Data Preparation ---
  const statusData = useMemo(() => {
    const counts: Record<string, number> = { verified: 0, pending: 0, maize: 0, rejected: 0 };
    farms.forEach(f => {
      const s = getFarmStatus(f);
      const mapped = s === 'flagged' ? 'pending' : s === 'non-maize' ? 'rejected' : s;
      if (counts[mapped] !== undefined) counts[mapped]++;
      else counts.maize++;
    });
    const result = [
      { name: 'Verified', value: counts.verified, color: COLORS.verified },
      { name: 'Pending', value: counts.pending, color: COLORS.pending },
      { name: 'Detected', value: counts.maize, color: COLORS.maize },
      { name: 'Rejected', value: counts.rejected, color: COLORS.rejected },
    ].filter(d => d.value > 0);
    
    if (result.length === 0) {
      return [{ name: 'No Data', value: 1, color: '#333' }];
    }
    return result;
  }, [farms]);

  const yieldTrendData = useMemo(() => {
    const validFarms = farms.filter(f => getFarmYield(f) > 0);
    if (validFarms.length === 0) {
      return [{ name: 'No Data', yield: 0 }];
    }
    return validFarms.map(f => ({
      name: f.name || f.id?.slice(0, 8) || 'Farm',
      yield: getFarmYield(f),
      confidence: getFarmConfidence(f) ? Math.round(getFarmConfidence(f) * 100) : 0,
    }));
  }, [farms]);

  // --- NDVI Time-Series Data (Task 11.1) ---
  const ndviTimeSeriesData = useMemo(() => {
    const seriesMap: Record<string, Record<string, number>> = {};
    const farmNames: string[] = [];

    farms.forEach(farm => {
      const analyses = farm.analyses || {};
      Object.values(analyses).forEach(analysis => {
        if (analysis.time_series && analysis.time_series.length >= 2) {
          const name = farm.name || farm.id?.slice(0, 8) || 'Farm';
          if (!farmNames.includes(name)) farmNames.push(name);
          analysis.time_series.forEach(ts => {
            if (ts.ndvi != null && isFinite(ts.ndvi) && ts.ndvi > 0) {
              if (!seriesMap[ts.date]) {
                seriesMap[ts.date] = {};
              }
              seriesMap[ts.date][name] = ts.ndvi;
            }
          });
        }
      });
    });

    // Merge all dates into a single array
    const allDates = Object.keys(seriesMap).sort();
    const merged = allDates.map(date => {
      const entry: Record<string, number | string> = { date };
      Object.entries(seriesMap[date]).forEach(([key, val]) => {
        entry[key] = val;
      });
      return entry;
    });

    return { data: merged, farmNames };
  }, [farms]);

  // --- Yield Distribution Histogram (Task 11.2) ---
  const yieldHistogramData = useMemo(() => {
    const bins = [
      { range: '0–1', min: 0, max: 1, count: 0 },
      { range: '1–2', min: 1, max: 2, count: 0 },
      { range: '2–3', min: 2, max: 3, count: 0 },
      { range: '3–4', min: 3, max: 4, count: 0 },
      { range: '4–5', min: 4, max: 5, count: 0 },
      { range: '5+', min: 5, max: Infinity, count: 0 },
    ];
    farms.forEach(f => {
      const y = getFarmYield(f);
      if (y <= 0) return;
      const bin = bins.find(b => y >= b.min && y < b.max) || bins[bins.length - 1];
      bin.count++;
    });
    return bins.map(b => ({ range: b.range, count: b.count }));
  }, [farms]);

  // --- Confidence Distribution Histogram (Task 11.3) ---
  const confidenceHistogramData = useMemo(() => {
    const bins = [
      { range: '0–20%', min: 0, max: 0.2, count: 0 },
      { range: '20–40%', min: 0.2, max: 0.4, count: 0 },
      { range: '40–60%', min: 0.4, max: 0.6, count: 0 },
      { range: '60–80%', min: 0.6, max: 0.8, count: 0 },
      { range: '80–100%', min: 0.8, max: 1.01, count: 0 },
    ];
    farms.forEach(f => {
      const c = getFarmConfidence(f);
      if (c <= 0) return;
      const bin = bins.find(b => c >= b.min && c < b.max) || bins[bins.length - 1];
      bin.count++;
    });
    return bins.map(b => ({ range: b.range, count: b.count }));
  }, [farms]);

  // --- Year-over-Year Comparison Data (Task 11.4) ---
  const yearOverYearData = useMemo(() => {
    const farmYearEntries: { farm: string; year: number; yield: number; ndvi: number }[] = [];

    farms.forEach(farm => {
      const analyses = farm.analyses || {};
      const years = Object.keys(analyses).map(Number);
      if (years.length < 2) return;

      years.forEach(year => {
        const a = analyses[year];
        if (a.yield !== undefined || a.time_series?.length) {
          const avgNdvi = a.time_series?.length
            ? a.time_series.reduce((sum, ts) => sum + ts.ndvi, 0) / a.time_series.length
            : 0;
          farmYearEntries.push({
            farm: farm.name || farm.id?.slice(0, 8) || 'Farm',
            year,
            yield: a.yield || 0,
            ndvi: avgNdvi,
          });
        }
      });
    });

    // Group by year for grouped bar chart
    const yearMap: Record<number, Record<string, number>> = {};
    farmYearEntries.forEach(e => {
      if (!yearMap[e.year]) yearMap[e.year] = {};
      yearMap[e.year][`${e.farm}_yield`] = e.yield;
      yearMap[e.year][`${e.farm}_ndvi`] = e.ndvi;
    });

    const allYears = Object.keys(yearMap).map(Number).sort();
    const chartData = allYears.map(year => ({
      year: year.toString(),
      ...yearMap[year],
    }));

    const farmNamesSet = new Set(farmYearEntries.map(e => e.farm));
    return { data: chartData, farmNames: [...farmNamesSet], hasData: farmYearEntries.length > 0 };
  }, [farms]);

  // --- District Summary grouped by Region (Ghana's 16 regions) ---
  const GHANA_REGIONS: Record<string, { lat: [number, number]; lng: [number, number] }> = {
    'Upper East': { lat: [10.5, 11.2], lng: [-1.5, 0.2] },
    'Upper West': { lat: [9.8, 11.0], lng: [-2.9, -1.5] },
    'North East': { lat: [10.0, 10.8], lng: [-0.5, 0.5] },
    'Northern': { lat: [9.0, 10.2], lng: [-1.5, 0.2] },
    'Savannah': { lat: [8.5, 10.0], lng: [-2.5, -0.8] },
    'Bono East': { lat: [7.5, 8.5], lng: [-2.0, -0.5] },
    'Bono': { lat: [7.0, 8.0], lng: [-3.0, -2.0] },
    'Ahafo': { lat: [6.8, 7.5], lng: [-2.8, -2.0] },
    'Ashanti': { lat: [6.0, 7.5], lng: [-2.2, -0.8] },
    'Eastern': { lat: [5.8, 7.2], lng: [-1.5, 0.5] },
    'Volta': { lat: [5.8, 8.5], lng: [-0.5, 1.2] },
    'Oti': { lat: [7.5, 9.0], lng: [-0.3, 0.8] },
    'Greater Accra': { lat: [5.4, 6.0], lng: [-0.5, 0.3] },
    'Central': { lat: [5.0, 6.2], lng: [-2.2, -0.8] },
    'Western': { lat: [4.8, 6.5], lng: [-3.2, -1.8] },
    'Western North': { lat: [5.5, 7.0], lng: [-3.2, -2.2] },
  };

  const getRegionForDistrict = (districtCenter: [number, number]): string => {
    const [lat, lng] = districtCenter;
    for (const [region, bounds] of Object.entries(GHANA_REGIONS)) {
      if (lat >= bounds.lat[0] && lat <= bounds.lat[1] && lng >= bounds.lng[0] && lng <= bounds.lng[1]) {
        return region;
      }
    }
    return 'Other';
  };

  const [districtSearch, setDistrictSearch] = useState('');
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const districtSummaryData = useMemo(() => {
    const districts = DataService.getDistricts();
    const districtMap: Record<string, { name: string; yields: number[]; ndvis: number[]; areas: number[]; count: number; center: [number, number] }> = {};

    districts.forEach(d => {
      const lats = d.coordinates.map(c => c[0]);
      const lngs = d.coordinates.map(c => c[1]);
      const center: [number, number] = [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      ];
      districtMap[d.name] = { name: d.name, yields: [], ndvis: [], areas: [], count: 0, center };
    });

    farms.forEach(farm => {
      const distName = assignDistrict(farm);
      if (!districtMap[distName]) {
        districtMap[distName] = { name: distName, yields: [], ndvis: [], areas: [], count: 0, center: farm.center };
      }
      districtMap[distName].count++;
      const fy = getFarmYield(farm);
      if (fy > 0) districtMap[distName].yields.push(fy);
      const fa = getFarmArea(farm);
      if (fa > 0) districtMap[distName].areas.push(fa);
      // Use flat confidence as a proxy for NDVI if no time_series
      const analyses = farm.analyses || {};
      const latestAnalysis = Object.values(analyses).sort((a, b) => b.year - a.year)[0];
      const avgNdvi = latestAnalysis?.time_series?.length
        ? latestAnalysis.time_series.reduce((s, ts) => s + ts.ndvi, 0) / latestAnalysis.time_series.length
        : 0;
      if (avgNdvi > 0) districtMap[distName].ndvis.push(avgNdvi);
    });

    return Object.values(districtMap).map(d => ({
      name: d.name,
      farmCount: d.count,
      avgYield: d.yields.length ? d.yields.reduce((a, b) => a + b, 0) / d.yields.length : 0,
      avgNdvi: d.ndvis.length ? d.ndvis.reduce((a, b) => a + b, 0) / d.ndvis.length : 0,
      totalArea: d.areas.reduce((a, b) => a + b, 0),
      region: d.center ? getRegionForDistrict(d.center) : 'Other',
    }));
  }, [farms]);

  // Group districts by region
  const regionGroupedDistricts = useMemo(() => {
    const q = districtSearch.toLowerCase();
    const filtered = q
      ? districtSummaryData.filter(d => d.name.toLowerCase().includes(q) || d.region.toLowerCase().includes(q))
      : districtSummaryData;

    const groups: Record<string, typeof filtered> = {};
    filtered.forEach(d => {
      if (!groups[d.region]) groups[d.region] = [];
      groups[d.region].push(d);
    });
    // Sort regions alphabetically, districts by farm count
    const sorted: Record<string, typeof filtered> = {};
    Object.keys(groups).sort().forEach(r => {
      sorted[r] = groups[r].sort((a, b) => b.farmCount - a.farmCount);
    });
    return sorted;
  }, [districtSummaryData, districtSearch]);

  // --- Model Quality Check (Task 11.7) ---
  const modelR2 = useMemo(() => {
    // Check if any farm has model_quality data from the enriched response
    // The current model has R² = -0.23 per the spec
    return -0.23;
  }, []);

  const FARM_COLORS = ['#10b981', '#3b82f6', '#eab308', '#f97316', '#8b5cf6', '#ec4899'];

  const handleExport = async () => {
    if (!dashboardRef.current) return;
    try {
      setIsExporting(true);
      const imgData = await toPng(dashboardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0a0a0a',
        skipFonts: true,
      });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 297;
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save('maize-analytics-dashboard.pdf');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // If a farm is selected, show the detailed farm analysis dashboard
  // Also auto-show detail view when there's exactly 1 farm in analysis mode
  const detailFarm = selectedFarm || (mode === 'analysis' && farms.length === 1 ? farms[0] : null);
  if (detailFarm) {
    const year = activeSeason || detailFarm.year || new Date().getFullYear();
    const analysis = detailFarm.analyses?.[year];
    const timeSeries = analysis?.time_series || [];
    const ancillary = analysis?.ancillary;
    const comparison = analysis?.comparison;
    const farmYield = analysis?.yield ?? detailFarm.yield ?? 0;
    const farmConfidence = analysis?.confidence ?? detailFarm.confidence ?? 0;
    const farmStatus = analysis?.status ?? detailFarm.status ?? 'pending';
    const farmArea = analysis?.area ?? detailFarm.area ?? 0;
    const latestTs = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null;

    return (
      <div className="flex flex-col w-full h-full bg-[#0a0a0a] overflow-y-auto scroll-smooth text-white [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="w-full min-h-full p-4 md:p-8 pt-16 md:pt-24 pb-20 md:pb-48 bg-[#0a0a0a]">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6">
            <div>
              <button onClick={onClearSelection} className="text-xs text-white/40 hover:text-white/70 mb-2 flex items-center gap-1 transition-colors">
                ← Back to Global Dashboard
              </button>
              <h1 className="text-2xl md:text-3xl font-light tracking-tight text-white">{detailFarm.name || 'Farm Analysis'}</h1>
              <p className="text-white/40 text-sm mt-1">
                Detailed satellite analysis for season {year} · ID: {detailFarm.id}
              </p>
            </div>
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border self-start ${
              farmStatus === 'maize' || farmStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              farmStatus === 'non-maize' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
            }`}>
              {farmStatus === 'maize' || farmStatus === 'verified' ? '🌽 Maize Detected' : farmStatus === 'non-maize' ? '❌ Non-Maize' : '⏳ ' + farmStatus}
            </span>
          </div>

          {/* Primary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
              <div className="text-[10px] text-white/40 uppercase mb-1">Classification</div>
              <div className={`text-xl font-light ${farmStatus === 'maize' || farmStatus === 'verified' ? 'text-emerald-400' : 'text-red-400'}`}>
                {farmStatus === 'maize' || farmStatus === 'verified' ? 'Maize' : 'Non-Maize'}
              </div>
            </div>
            <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
              <div className="text-[10px] text-white/40 uppercase mb-1">Confidence</div>
              <div className="text-xl font-light text-white">{(farmConfidence * 100).toFixed(1)}%</div>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${farmConfidence * 100}%` }} />
              </div>
            </div>
            <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
              <div className="text-[10px] text-white/40 uppercase mb-1">Est. Yield</div>
              <div className="text-xl font-light text-emerald-400">{farmYield > 0 ? farmYield.toFixed(2) : '—'} <span className="text-sm text-emerald-400/50">t/ha</span></div>
            </div>
            <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
              <div className="text-[10px] text-white/40 uppercase mb-1">Area</div>
              <div className="text-xl font-light text-white">{farmArea > 0 ? farmArea.toFixed(1) : '—'} <span className="text-sm text-white/40">ha</span></div>
            </div>
            <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
              <div className="text-[10px] text-white/40 uppercase mb-1">Season</div>
              <div className="text-xl font-light text-white">{year}</div>
              <div className="text-[10px] text-white/30 mt-1">Jun – Oct</div>
            </div>
          </div>

          {/* GEE Classification & Yield Map */}
          <GeeMapPanel farm={detailFarm} year={year} />

          {/* Spectral Indices + Environmental Context */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-3">Spectral Indices (Sentinel-2)</h3>
              <div className="space-y-3">
                {[
                  { name: 'NDVI', value: latestTs?.ndvi, color: '#10b981', desc: 'Vegetation greenness', max: 1 },
                  { name: 'EVI', value: latestTs?.evi, color: '#3b82f6', desc: 'Enhanced vegetation', max: 1 },
                  { name: 'NDMI', value: latestTs?.ndmi, color: '#06b6d4', desc: 'Moisture stress', max: 0.5 },
                  { name: 'GCVI', value: latestTs?.gcvi, color: '#84cc16', desc: 'Chlorophyll content', max: 3 },
                  { name: 'NDRE', value: latestTs?.ndre, color: '#f59e0b', desc: 'Red-edge vigor', max: 0.5 },
                ].map(idx => (
                  <div key={idx.name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-white/70">{idx.name} <span className="text-[9px] text-white/30">({idx.desc})</span></span>
                      <span className="text-xs font-mono" style={{ color: idx.color }}>
                        {idx.value != null && isFinite(idx.value) ? idx.value.toFixed(4) : '—'}
                      </span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        backgroundColor: idx.color,
                        width: idx.value != null && isFinite(idx.value) ? `${Math.min(Math.abs(idx.value) / idx.max * 100, 100)}%` : '0%'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-3">Environmental Context</h3>
              {ancillary ? (
                <div className="space-y-3">
                  {[
                    { label: 'Elevation', value: `${ancillary.elevation?.toFixed(0)} m`, icon: '⛰️' },
                    { label: 'Slope', value: `${ancillary.slope?.toFixed(1)}%`, icon: '📐' },
                    { label: 'Rainfall (Jun–Oct)', value: `${ancillary.precip?.toFixed(0)} mm`, icon: '🌧️' },
                    { label: 'Max Temperature', value: `${ancillary.temp_max?.toFixed(1)} °C`, icon: '🌡️' },
                    { label: 'Soil Organic Carbon', value: `${ancillary.SOC?.toFixed(1)} g/kg`, icon: '🪨' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-xs text-white/60">{item.icon} {item.label}</span>
                      <span className="text-xs font-mono text-white/90">{item.value}</span>
                    </div>
                  ))}
                  <div className="text-[8px] text-white/20 mt-2">
                    Sources: {Object.entries(ancillary.sources || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-white/30 text-xs">Run analysis to fetch environmental data</div>
              )}
            </div>
          </div>

          {/* NDVI Time-Series */}
          <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl mb-6">
            <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">NDVI Time-Series ({year} Growing Season)</h3>
            <p className="text-xs text-white/40 mb-4">Vegetation index trends from Sentinel-2 (Jun–Oct)</p>
            {timeSeries.filter(t => t.ndvi != null).length >= 2 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeries.filter(t => t.ndvi != null)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" dataKey="ndvi" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="NDVI" />
                    <Line type="monotone" dataKey="evi" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 3 }} name="EVI" />
                    <Line type="monotone" dataKey="ndmi" stroke="#06b6d4" strokeWidth={1.5} dot={{ r: 3 }} name="NDMI" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-white/30 text-sm border border-dashed border-white/10 rounded-lg">
                {timeSeries.length === 0 ? 'No time-series data yet. Run analysis to extract multi-temporal indices.' : 'Need at least 2 valid scenes for chart.'}
              </div>
            )}
          </div>

          {/* Variable Importance + Model Quality */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Variable Importance (Random Forest)</h3>
              <p className="text-xs text-white/40 mb-4">Feature contribution to yield prediction</p>
              <div className="h-64 w-full">
                {isChartReady && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'NDVI', imp: 18.2 }, { name: 'EVI', imp: 14.5 },
                        { name: 'GCVI', imp: 12.8 }, { name: 'NDRE', imp: 11.3 },
                        { name: 'NDMI', imp: 9.7 }, { name: 'MTCI', imp: 8.1 },
                        { name: 'precip', imp: 7.4 }, { name: 'temp', imp: 5.9 },
                        { name: 'elev', imp: 4.8 }, { name: 'SOC', imp: 3.6 },
                      ]}
                      layout="vertical" margin={{ left: 40, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                      <XAxis type="number" stroke="#ffffff40" fontSize={10} tickLine={false} />
                      <YAxis type="category" dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                      <Bar dataKey="imp" name="Importance" radius={[0, 4, 4, 0]}>
                        {[0,1,2,3,4,5,6,7,8,9].map(i => (
                          <Cell key={i} fill={i < 3 ? '#10b981' : i < 6 ? '#3b82f6' : '#6b7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Model & Data Quality</h3>
              <p className="text-xs text-white/40 mb-4">RF 500 trees · Sentinel-2 via GEE · 2021–2023</p>
              <div className="space-y-3">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase mb-1">Classifier Accuracy</div>
                  <div className="text-lg font-light text-emerald-400">87.7%</div>
                  <div className="text-[10px] text-white/30">Cross-validated · 178 samples</div>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="text-[10px] text-amber-400 uppercase mb-1">Yield Regressor R²</div>
                  <div className="text-lg font-light text-amber-400">-0.23</div>
                  <div className="text-[10px] text-amber-300/50">RMSE: 1.40 t/ha · 127 samples</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase mb-1">Satellite Source</div>
                  <div className="text-sm text-white/80">Sentinel-2 L2A (Harmonized)</div>
                  <div className="text-[10px] text-white/30">Google Earth Engine · 10m · SCL cloud mask</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase mb-1">Study Region</div>
                  <div className="text-sm text-white/80">Northern Ghana (Nanton)</div>
                  <div className="text-[10px] text-white/30">Jun–Oct growing season · UTM 30N</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#0a0a0a] overflow-y-auto scroll-smooth text-white [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <div ref={dashboardRef} className="w-full min-h-full p-4 md:p-8 pt-16 md:pt-24 pb-20 md:pb-48 bg-[#0a0a0a]">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6 md:mb-8">
          <div className="flex-1">
            <div className="flex items-center gap-2 md:gap-3 mb-1 flex-wrap">
               <h1 className="text-2xl md:text-3xl font-light tracking-tight text-white">
                 {mode === 'analysis' ? 'Analysis Results Dashboard' : 'Dashboard Analytics'}
               </h1>
               <div className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded border flex items-center gap-1 ${
                 mode === 'analysis' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
               }`}>
                  <Satellite size={12} />
                  {mode === 'analysis' ? 'Verified Batch Data' : 'GEE Analysis'}
               </div>
            </div>
            <p className="text-white/40 text-sm">
                {mode === 'analysis' 
                  ? `Showing results for the most recent batch of ${farms.length} analyzed farm(s).` 
                  : 'GEE-based satellite analysis and ML classification for the 2023 season.'}
            </p>
          </div>
          <div className="flex gap-2 md:gap-3 flex-wrap md:flex-nowrap">
            {mode === 'analysis' && (
                <button 
                   onClick={onSwitchToGlobal}
                   className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-2 bg-white/5 hover:bg-white/10 active:bg-white/5 rounded-lg text-xs md:text-sm text-white font-medium border border-white/10 transition-all whitespace-nowrap"
                >
                  <Map size={16} />
                  View All Regions
                </button>
            )}
            {mode === 'global' && onSwitchToAnalysis && (
                <button 
                   onClick={onSwitchToAnalysis}
                   className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-2 bg-emerald-600/20 hover:bg-emerald-600/30 active:bg-emerald-600/10 rounded-lg text-xs md:text-sm text-emerald-400 font-medium border border-emerald-500/20 transition-all whitespace-nowrap"
                >
                  <Target size={16} />
                  Back to Analysis
                </button>
            )}
            <button 
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg text-xs md:text-sm text-white font-medium shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isExporting ? (
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
              ) : (
                <Download size={16} />
              )}
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>

        {/* MODEL QUALITY DISCLAIMER (Task 11.7) — shown when R² < 0.3 */}
        {modelR2 < 0.3 && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 md:mb-8">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 text-sm font-medium">Yield Prediction Accuracy Disclaimer</p>
              <p className="text-amber-200/70 text-xs mt-1 leading-relaxed">
                The yield regressor currently has an R² of <span className="font-mono text-amber-300">{modelR2.toFixed(2)}</span> (RMSE ≈ 1.4 t/ha), indicating limited predictive accuracy. Yield values shown are model estimates and should be interpreted with caution. Classification results (maize / non-maize) remain reliable at 87.7% accuracy.
              </p>
            </div>
          </div>
        )}

        {/* INTELLIGENCE LAYER */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
           {/* Main AI Insight Card */}
           <div className={`bg-gradient-to-br border rounded-xl md:rounded-2xl p-4 md:p-6 relative overflow-hidden ${
               mode === 'analysis' ? 'from-emerald-900/20 to-teal-900/10 border-emerald-500/20 md:col-span-3' : 'from-indigo-900/20 to-purple-900/10 border-indigo-500/20 md:col-span-2'
            }`}>
               <div className={`absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full pointer-events-none ${
                  mode === 'analysis' ? 'bg-emerald-600/10' : 'bg-indigo-600/10'
               }`} />
               
               <h3 className={`font-medium mb-3 md:mb-4 flex items-center gap-2 text-xs md:text-sm uppercase tracking-wider relative z-10 ${
                  mode === 'analysis' ? 'text-emerald-300' : 'text-indigo-300'
               }`}>
                  <Target size={14} />
                  {mode === 'analysis' ? 'Post-Analysis Summary' : 'Analysis Insights'}
               </h3>
               
               <div className={`space-y-3 md:space-y-4 relative z-10 ${mode === 'analysis' ? 'grid grid-cols-1 md:grid-cols-3 gap-4 md:space-y-0' : ''}`}>
                  {mode === 'analysis' && farms.length > 0 ? (
                      <>
                        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                            <h4 className="text-white/60 text-xs mb-1">Batch Performance</h4>
                            <p className="text-sm text-white">This batch averaged <span className="text-emerald-400 font-mono">{metrics.avgYield.toFixed(2)} t/ha</span>, which is {metrics.avgYield > 2.0 ? 'above' : 'below'} the regional baseline.</p>
                        </div>
                        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                            <h4 className="text-white/60 text-xs mb-1">Verification Rate</h4>
                            <p className="text-sm text-white"><span className="text-blue-400 font-mono">{metrics.verificationRate}%</span> of imported geometries were successfully verified as maize.</p>
                        </div>
                        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                            <h4 className="text-white/60 text-xs mb-1">Next Steps</h4>
                            <p className="text-sm text-white">Export these verified results to sync with your external agricultural management tools.</p>
                        </div>
                      </>
                  ) : (
                      insights.map((insight, idx) => (
                          <div key={idx} className="flex gap-3 md:gap-4 items-start group">
                              <div className={`mt-1 w-1.5 h-1.5 flex-shrink-0 rounded-full ${insight.type === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : insight.type === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              <div className="flex-1 min-w-0">
                                  <h4 className="text-white font-medium text-sm mb-1 group-hover:text-indigo-200 transition-colors">{insight.title}</h4>
                                  <p className="text-white/60 text-xs leading-relaxed mb-2">{insight.description}</p>
                                  {insight.action && (
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/5 rounded text-[10px] text-indigo-200 hover:bg-indigo-500/20 active:bg-indigo-500/30 hover:border-indigo-500/30 transition-all cursor-pointer">
                                          <Target size={10} className="flex-shrink-0" />
                                          <span className="truncate">{insight.action}</span>
                                          <ArrowRight size={10} className="ml-1 opacity-50 flex-shrink-0" />
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))
                  )}
               </div>
           </div>

           {/* Key KPI - Season Info */}
           {mode !== 'analysis' && (
               <div className="bg-white/5 border border-white/5 rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col justify-between relative overflow-hidden">
                   <div>
                      <h3 className="text-white/40 text-xs uppercase tracking-wider font-medium mb-1">Classification Accuracy</h3>
                  <div className="text-3xl md:text-3xl font-light text-white">87.7%</div>
                  <div className="text-emerald-400 text-xs mt-1 flex items-center gap-1">
                      <TrendingUp size={12} />
                      Random Forest · 178 samples
                  </div>
               </div>
               
               <div className="mt-4 md:mt-6">
                   <div className="flex justify-between text-xs text-white/40 mb-2">
                      <span>Satellite Source</span>
                      <span className="text-white">Sentinel-2 L2A</span>
                   </div>
                   <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 w-[88%] h-full rounded-full" />
                   </div>
               </div>
               
               {/* Decorative BG */}
               <div className="absolute -bottom-10 -right-10 text-white/5">
                   <Satellite size={120} strokeWidth={0.5} />
               </div>
           </div>
           )}
        </div>

        {/* METRIC GRID */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
             <div className="flex items-center gap-2 text-white/40 mb-2">
                <Map size={14} />
                <span className="text-xs uppercase tracking-wider font-medium">Total Area</span>
             </div>
             <div className="text-2xl font-light">{metrics.totalArea.toFixed(1)} <span className="text-sm text-white/40">ha</span></div>
          </div>
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
             <div className="flex items-center gap-2 text-white/40 mb-2">
                <Sprout size={14} />
                <span className="text-xs uppercase tracking-wider font-medium">Avg Yield</span>
             </div>
             <div className="text-2xl font-light">{metrics.avgYield.toFixed(1)} <span className="text-sm text-white/40">t/ha</span></div>
          </div>
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
             <div className="flex items-center gap-2 text-white/40 mb-2">
                <TrendingUp size={14} />
                <span className="text-xs uppercase tracking-wider font-medium">Projected</span>
             </div>
             <div className="text-2xl font-light text-emerald-400">{metrics.projectedProduction.toFixed(0)} <span className="text-sm text-emerald-400/50">tons</span></div>
          </div>
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
             <div className="flex items-center gap-2 text-white/40 mb-2">
                <CheckCircle2 size={14} />
                <span className="text-xs uppercase tracking-wider font-medium">Verified</span>
             </div>
             <div className="text-2xl font-light">{metrics.verificationRate}% <span className="text-sm text-white/40">rate</span></div>
          </div>
        </div>

        {/* CHARTS LAYER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
           {/* Farm Selector List */}
           <div className="lg:col-span-3 bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl mb-0">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Farm Analysis Results</h3>
                  <p className="text-xs text-white/40">Click a farm to view detailed analysis</p>
                </div>
                <span className="text-[10px] text-white/30 bg-white/5 px-2 py-1 rounded">{farms.length} farm{farms.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded">
                {farms.map((farm) => {
                  const fStatus = getFarmStatus(farm);
                  const fYield = getFarmYield(farm);
                  const fConfidence = getFarmConfidence(farm);
                  const fHealth = fYield >= 2.5 ? 'excellent' : fYield >= 1.5 ? 'good' : fYield >= 0.8 ? 'moderate' : fYield > 0 ? 'poor' : null;
                  return (
                    <button
                      key={farm.id}
                      onClick={() => onSelectFarm?.(farm)}
                      className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-emerald-500/20 rounded-lg transition-all text-left group"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        fStatus === 'maize' || fStatus === 'verified' ? 'bg-emerald-500' :
                        fStatus === 'non-maize' || fStatus === 'rejected' ? 'bg-red-500' : 'bg-white/30'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/80 font-medium truncate group-hover:text-emerald-300 transition-colors">
                          {farm.name || farm.id?.slice(0, 12)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] ${fStatus === 'maize' || fStatus === 'verified' ? 'text-emerald-400' : fStatus === 'non-maize' ? 'text-red-400' : 'text-white/40'}`}>
                            {fStatus === 'maize' || fStatus === 'verified' ? 'Maize' : fStatus === 'non-maize' ? 'Non-Maize' : 'Pending'}
                          </span>
                          {fHealth && (
                            <span className={`text-[9px] ${fHealth === 'excellent' || fHealth === 'good' ? 'text-green-400' : fHealth === 'moderate' ? 'text-amber-400' : 'text-red-400'}`}>
                              · {fHealth}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono text-emerald-400">{fYield > 0 ? `${fYield.toFixed(1)}` : '—'}</div>
                        <div className="text-[8px] text-white/30">t/ha</div>
                      </div>
                    </button>
                  );
                })}
              </div>
           </div>
        </div>

        {/* CHARTS LAYER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
           {/* Primary Yield Chart */}
           <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Farm Yield Comparison</h3>
                    <p className="text-xs text-white/40">Predicted yield per farm (t/ha)</p>
                 </div>
                 <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider font-bold">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Yield</div>
                 </div>
              </div>
              <div className="h-64 md:h-72 w-full">
                 {isChartReady && (
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={yieldTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                       <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                       <XAxis key="x-axis" dataKey="name" stroke="#ffffff40" fontSize={9} tickLine={false} axisLine={false} />
                       <YAxis key="y-axis" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}t`} />
                       <Tooltip key="tooltip"
                         contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '12px' }}
                         itemStyle={{ color: '#fff' }}
                         formatter={(value: number) => [`${value.toFixed(2)} t/ha`, 'Yield']}
                       />
                       <Bar key="bar-yield" dataKey="yield" fill="#10b981" radius={[4, 4, 0, 0]} />
                     </BarChart>
                   </ResponsiveContainer>
                 )}
              </div>
           </div>

           {/* Distribution Chart */}
           <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl flex flex-col">
              <div>
                 <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Status Distribution</h3>
                 <p className="text-xs text-white/40">Current farm lifecycle states</p>
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[200px] md:min-h-[0]">
                 {isChartReady && (
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie key="pie-main"
                         data={statusData}
                         innerRadius={60}
                         outerRadius={80}
                         paddingAngle={5}
                         dataKey="value"
                         stroke="none"
                       >
                         {statusData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                         ))}
                       </Pie>
                       <Tooltip key="tooltip-pie"
                         contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '12px' }}
                         itemStyle={{ color: '#fff' }}
                       />
                     </PieChart>
                   </ResponsiveContainer>
                 )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                 {statusData.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-white/80">{s.name}</span>
                        <span className="text-white/40 ml-auto">{s.value}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* NDVI TIME-SERIES LINE CHART (Task 11.1) */}
        <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl mb-6 md:mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">NDVI Time-Series</h3>
              <p className="text-xs text-white/40">Vegetation index trends across the growing season per farm</p>
            </div>
          </div>
          {farms.length < 2 ? (
            <div className="h-64 flex items-center justify-center text-white/30 text-sm">
              Analyze at least 2 farms with time-series data to view NDVI trends.
            </div>
          ) : ndviTimeSeriesData.data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-white/30 text-sm">
              No time-series data available. Run analysis with multi-temporal scene extraction enabled.
            </div>
          ) : (
            <div className="h-64 md:h-72 w-full">
              {isChartReady && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ndviTimeSeriesData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="date" stroke="#ffffff40" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={(val: number) => val.toFixed(1)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', color: '#ffffff80' }} />
                    {ndviTimeSeriesData.farmNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={FARM_COLORS[i % FARM_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        {/* YIELD & CONFIDENCE DISTRIBUTION ROW (Tasks 11.2, 11.3) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          {/* Yield Distribution Histogram (Task 11.2) */}
          <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl">
            <div className="mb-6">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Yield Distribution</h3>
              <p className="text-xs text-white/40">Histogram of predicted yields across farms (t/ha)</p>
            </div>
            <div className="h-56 w-full">
              {isChartReady && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yieldHistogramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="range" stroke="#ffffff40" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: number) => [`${value} farm${value !== 1 ? 's' : ''}`, 'Count']}
                    />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Confidence Distribution Histogram (Task 11.3) */}
          <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl">
            <div className="mb-6">
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Confidence Distribution</h3>
              <p className="text-xs text-white/40">Classifier confidence scores across analyzed farms</p>
            </div>
            <div className="h-56 w-full">
              {isChartReady && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={confidenceHistogramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="range" stroke="#ffffff40" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: number) => [`${value} farm${value !== 1 ? 's' : ''}`, 'Count']}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* YEAR-OVER-YEAR COMPARISON (Task 11.4) */}
        {yearOverYearData.hasData && (
          <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl mb-6 md:mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Year-over-Year Comparison</h3>
                <p className="text-xs text-white/40">Yield comparison across growing seasons for farms with multi-year data</p>
              </div>
            </div>
            <div className="h-64 md:h-72 w-full">
              {isChartReady && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearOverYearData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="year" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val: number) => `${val}t`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#000000', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', color: '#ffffff80' }} />
                    {yearOverYearData.farmNames.map((name, i) => (
                      <Bar key={`${name}_yield`} dataKey={`${name}_yield`} name={`${name} Yield`} fill={FARM_COLORS[i % FARM_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* DISTRICT SUMMARY BY REGION */}
        <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3 mb-4">
            <div>
              <h3 className="text-sm uppercase tracking-wider font-medium text-white/60 mb-1">Districts by Region</h3>
              <p className="text-xs text-white/40">Ghana's 16 regions · {districtSummaryData.length} districts</p>
            </div>
            <div className="relative w-full md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                placeholder="Search districts or regions..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded">
            {Object.entries(regionGroupedDistricts).map(([region, districts]) => (
              <div key={region}>
                <button
                  onClick={() => setExpandedRegions(prev => {
                    const next = new Set(prev);
                    if (next.has(region)) next.delete(region); else next.add(region);
                    return next;
                  })}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30">{expandedRegions.has(region) ? '▼' : '▶'}</span>
                    <span className="text-sm font-medium text-white/80">{region} Region</span>
                    <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{districts.length}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-white/40">
                    <span>{districts.reduce((s, d) => s + d.farmCount, 0)} farms</span>
                    <span>{districts.reduce((s, d) => s + d.totalArea, 0).toFixed(0)} ha</span>
                  </div>
                </button>

                {expandedRegions.has(region) && (
                  <div className="ml-4 border-l border-white/5 pl-3 py-1 space-y-0.5">
                    {districts.map((d, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 px-2 rounded hover:bg-white/[0.03] transition-colors text-xs">
                        <span className="text-white/70">{d.name}</span>
                        <div className="flex items-center gap-4 text-white/40 font-mono">
                          <span>{d.farmCount} farms</span>
                          <span className={d.avgYield >= 2 ? 'text-emerald-400' : d.avgYield > 0 ? 'text-amber-400' : ''}>
                            {d.avgYield > 0 ? `${d.avgYield.toFixed(1)} t/ha` : '—'}
                          </span>
                          <span>{d.totalArea > 0 ? `${d.totalArea.toFixed(0)} ha` : '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {Object.keys(regionGroupedDistricts).length === 0 && (
              <div className="text-center py-8 text-white/30 text-sm">No districts match your search</div>
            )}
          </div>
        </div>

        {/* Farm Comparison Cards */}
        {farms.filter(f => f.yield && f.yield > 0).length > 0 && (
          <div className="bg-white/[0.02] border border-white/5 p-4 md:p-6 rounded-xl md:rounded-2xl mb-6 md:mb-8">
            <h4 className="text-xs uppercase tracking-wider font-medium text-white/40 mb-3">Farm vs District Comparison</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {farms.filter(f => f.yield && f.yield > 0).slice(0, 6).map((farm, idx) => {
                  const distName = assignDistrict(farm);
                  const distData = districtSummaryData.find(d => d.name === distName);
                  const yieldDelta = distData && distData.avgYield > 0 ? (farm.yield || 0) - distData.avgYield : 0;
                  const isAbove = yieldDelta >= 0;
                  return (
                    <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-white text-xs font-medium truncate">{farm.name || farm.id?.slice(0, 12)}</span>
                        <span className="text-[10px] text-white/40">{distName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm">{(farm.yield || 0).toFixed(2)} t/ha</span>
                        {distData && distData.avgYield > 0 && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isAbove ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {isAbove ? '+' : ''}{yieldDelta.toFixed(2)} vs avg
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        
      </div>
    </div>
  );
};
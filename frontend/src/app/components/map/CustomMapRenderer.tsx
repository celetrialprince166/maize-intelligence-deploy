import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Farm, District } from '@/app/services/storage';
import { MapStyle } from '@/app/components/ui/ToolsPanel';
import { getStatusColor } from './utils';
import { getStatusLabel } from './utils';

// No token = no Mapbox tiles (map falls back to blank/empty basemap) until
// VITE_MAPBOX_TOKEN is supplied at build time — see .env.example.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// Set token globally to prevent access token errors
mapboxgl.accessToken = MAPBOX_TOKEN;
// Override the base API URL so Mapbox GL doesn't try to send telemetry to events.mapbox.com
// which would result in a 401 error with the dummy token and crash the WebGL context.
mapboxgl.baseApiUrl = "https://localhost:9999";

interface CustomMapRendererProps {
  farms: Farm[];
  districts: District[];
  regions?: District[];
  activeLayers: string[];
  mapStyle: MapStyle;
  center: [number, number];
  zoom: number;
  selectedDistrictId?: string | null;
  onFarmClick: (farm: Farm) => void;
  onDistrictClick: (district: District) => void;
  onMapClick: () => void;
  isOffline?: boolean;
  isDrawingMode?: boolean;
  isEditingMode?: boolean;
  drawPoints?: Array<{ lat: number; lng: number }>;
  onMapPointClick?: (lat: number, lng: number) => void;
}

export const CustomMapRenderer: React.FC<CustomMapRendererProps> = ({
  farms,
  districts,
  regions = [],
  activeLayers,
  mapStyle,
  center,
  zoom,
  selectedDistrictId = null,
  onFarmClick,
  onDistrictClick,
  onMapClick,
  isOffline = false,
  isDrawingMode = false,
  isEditingMode = false,
  drawPoints = [],
  onMapPointClick
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [hoveredFarmId, setHoveredFarmId] = useState<string | null>(null);
  const hoveredFarmIdRef = useRef<string | null>(null);

  // Keep references to props to avoid stale closures in Mapbox callbacks
  const propsRef = useRef({
    onMapPointClick,
    onFarmClick,
    onDistrictClick,
    onMapClick,
    isDrawingMode,
    isEditingMode,
    farms,
    districts
  });

  useEffect(() => {
    propsRef.current = {
      onMapPointClick,
      onFarmClick,
      onDistrictClick,
      onMapClick,
      isDrawingMode,
      isEditingMode,
      farms,
      districts
    };
  }, [onMapPointClick, onFarmClick, onDistrictClick, onMapClick, isDrawingMode, isEditingMode, farms, districts]);

  const mapboxStyleUrl = useMemo<mapboxgl.Style>(() => {
    switch (mapStyle) {
      case 'satellite': return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256
          }
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 19 }]
      };
      case 'light': return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          light: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'light', type: 'raster', source: 'light', minzoom: 0, maxzoom: 19 }]
      };
      case 'dark':
      default: return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          dark: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'dark', type: 'raster', source: 'dark', minzoom: 0, maxzoom: 19 }]
      };
    }
  }, [mapStyle]);

  // Convert district data to GeoJSON
  const districtsGeoJSON = useMemo(() => {
    const features = districts.map(district => {
      let coords = district.coordinates.map(c => [c[1], c[0]]); // [lng, lat]
      if (coords.length > 0 && 
         (coords[0][0] !== coords[coords.length - 1][0] || 
          coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push([...coords[0]]);
      }

      return {
        type: 'Feature',
        id: district.id,
        properties: {
          id: district.id,
          name: district.name,
          isSelected: selectedDistrictId === district.id
        },
        geometry: {
          type: 'Polygon',
          coordinates: coords.length > 2 ? [coords] : []
        }
      };
    }).filter(f => f.geometry.coordinates.length > 0);

    return { type: 'FeatureCollection', features };
  }, [districts, selectedDistrictId]);

  // Convert region data to GeoJSON
  const regionsGeoJSON = useMemo(() => {
    const features = regions.map(region => {
      let coords = region.coordinates.map(c => [c[1], c[0]]);
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push([...coords[0]]);
      }
      return {
        type: 'Feature',
        properties: { id: region.id, name: region.name },
        geometry: { type: 'Polygon', coordinates: coords.length > 2 ? [coords] : [] }
      };
    }).filter(f => f.geometry.coordinates.length > 0);
    return { type: 'FeatureCollection', features };
  }, [regions]);

  // Convert farm data to GeoJSON — filtered by active layer visibility
  const farmsGeoJSON = useMemo(() => {
    // Check which status categories are visible
    const statusLayerMap: Record<string, string[]> = {
      'show-maize': ['maize', 'verified'],
      'show-non-maize': ['non-maize', 'rejected'],
      'show-pending': ['pending'],
      'show-flagged': ['flagged'],
    };

    const visibleStatuses = new Set<string>();
    Object.entries(statusLayerMap).forEach(([layerId, statuses]) => {
      if (activeLayers.includes(layerId)) {
        statuses.forEach(s => visibleStatuses.add(s));
      }
    });

    const features = farms
      .filter(farm => {
        // Only show farms whose status matches an active layer
        return visibleStatuses.has(farm.status);
      })
      .map(farm => {
      let coords = farm.coordinates?.map(c => [c[1], c[0]]) || []; // [lng, lat]
      if (coords.length > 0 && 
         (coords[0][0] !== coords[coords.length - 1][0] || 
          coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push([...coords[0]]);
      }

      const hasData = farm.hasDataForSeason !== false;
      const color = getStatusColor(farm.status);

      return {
        type: 'Feature',
        id: farm.id,
        properties: {
          id: farm.id,
          status: farm.status,
          area: farm.area,
          yield: farm.yield,
          color,
          hasDataForSeason: hasData,
          isVerification: activeLayers.includes('verification') && (farm.status === 'pending' || farm.status === 'flagged')
        },
        geometry: {
          type: 'Polygon',
          coordinates: coords.length > 2 ? [coords] : []
        }
      };
    }).filter(f => f.geometry.coordinates.length > 0);

    return { type: 'FeatureCollection', features };
  }, [farms, activeLayers]);

  // Farm center points for markers (shown when zoomed out)
  const farmCentersGeoJSON = useMemo(() => {
    const statusLayerMap: Record<string, string[]> = {
      'show-maize': ['maize', 'verified'],
      'show-non-maize': ['non-maize', 'rejected'],
      'show-pending': ['pending'],
      'show-flagged': ['flagged'],
    };
    const visibleStatuses = new Set<string>();
    Object.entries(statusLayerMap).forEach(([layerId, statuses]) => {
      if (activeLayers.includes(layerId)) statuses.forEach(s => visibleStatuses.add(s));
    });

    const features = farms
      .filter(f => visibleStatuses.has(f.status) && f.center)
      .map(farm => ({
        type: 'Feature',
        properties: {
          id: farm.id,
          name: farm.name || 'Farm',
          status: farm.status,
          isMaize: farm.status === 'maize' || farm.status === 'verified',
        },
        geometry: { type: 'Point', coordinates: [farm.center[1], farm.center[0]] },
      }));
    return { type: 'FeatureCollection', features };
  }, [farms, activeLayers]);

  // Convert drawing points to GeoJSON
  const drawingGeoJSON = useMemo(() => {
    if (!isDrawingMode && !isEditingMode) return { type: 'FeatureCollection', features: [] };
    
    const coords = drawPoints.map(p => [p.lng, p.lat]);
    const features: any[] = [];

    // Points
    features.push(...coords.map((c, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c },
      properties: { type: 'point', index: i }
    })));

    // Line
    if (coords.length > 1) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { type: 'line' }
      });
    }

    // Polygon
    if (coords.length > 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
        properties: { type: 'polygon' }
      });
    }

    return { type: 'FeatureCollection', features };
  }, [drawPoints, isDrawingMode, isEditingMode]);

  const addSourcesAndLayersRef = useRef<((map: mapboxgl.Map) => void) | null>(null);

  const addSourcesAndLayers = useCallback((map: mapboxgl.Map) => {
    // Districts are handled by the dedicated boundary effect below
    if (!map.getSource('districts')) {
      map.addSource('districts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }

    // Old district layers removed — boundaries handled by dedicated effect

    if (!map.getSource('farms')) {
      map.addSource('farms', {
        type: 'geojson',
        data: farmsGeoJSON as any
      });
    }

    if (!map.getLayer('farm-fill')) {
      map.addLayer({
        id: 'farm-fill',
        type: 'fill',
        source: 'farms',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['boolean', ['get', 'isVerification'], false], 0.3,
            ['boolean', ['get', 'hasDataForSeason'], true], 0.4,
            0.15  // farms without data for selected season are nearly transparent
          ]
        }
      });
    }

    if (!map.getLayer('farm-line')) {
      map.addLayer({
        id: 'farm-line',
        type: 'line',
        source: 'farms',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': [
            'case',
            ['boolean', ['get', 'hasDataForSeason'], true], 1.0,
            0.5
          ]
        }
      });
    }

    // Farm center markers with clustering
    if (!map.getSource('farm-centers')) {
      map.addSource('farm-centers', {
        type: 'geojson',
        data: farmCentersGeoJSON as any,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 50,
      });
    }

    // Cluster circles
    if (!map.getLayer('farm-clusters')) {
      map.addLayer({
        id: 'farm-clusters',
        type: 'circle',
        source: 'farm-centers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#10b981',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-stroke-opacity': 0.3,
        },
      });
    }

    // Cluster count text
    if (!map.getLayer('farm-cluster-count')) {
      map.addLayer({
        id: 'farm-cluster-count',
        type: 'symbol',
        source: 'farm-centers',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['concat', ['to-string', ['get', 'point_count']], ' 🌽'],
          'text-size': 12,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#fff' },
      });
    }

    // Individual farm markers (unclustered)
    if (!map.getLayer('farm-markers')) {
      map.addLayer({
        id: 'farm-markers',
        type: 'symbol',
        source: 'farm-centers',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': '🌽',
          'text-size': 20,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        minzoom: 0,
        maxzoom: 13,
      });
    }

    if (!map.getSource('drawing')) {
      map.addSource('drawing', {
        type: 'geojson',
        data: drawingGeoJSON as any
      });
    }

    if (!map.getLayer('drawing-polygon')) {
      map.addLayer({
        id: 'drawing-polygon',
        type: 'fill',
        source: 'drawing',
        filter: ['==', 'type', 'polygon'],
        paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.2 }
      });
    }

    if (!map.getLayer('drawing-line')) {
      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: 'drawing',
        filter: ['==', 'type', 'line'],
        paint: { 'line-color': '#22c55e', 'line-width': 2, 'line-dasharray': [4, 4] }
      });
    }

    if (!map.getLayer('drawing-points')) {
      map.addLayer({
        id: 'drawing-points',
        type: 'circle',
        source: 'drawing',
        filter: ['==', 'type', 'point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#22c55e',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff'
        }
      });
    }
  }, [districtsGeoJSON, farmsGeoJSON, drawingGeoJSON, mapStyle]);

  useEffect(() => {
    addSourcesAndLayersRef.current = addSourcesAndLayers;
  }, [addSourcesAndLayers]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Bypasses telemetry to prevent 401 auth errors clearing the WebGL context
    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapboxgl.baseApiUrl = "https://localhost:9999";
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapboxStyleUrl,
      center: [center[1], center[0]],
      zoom: zoom,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', () => {
      addSourcesAndLayers(map);

      // Events
      map.on('click', (e) => {
        const p = propsRef.current;
        if (p.isDrawingMode || p.isEditingMode) {
          p.onMapPointClick?.(e.lngLat.lat, e.lngLat.lng);
          return;
        }

        // Check for cluster click
        const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: ['farm-clusters'] });
        if (clusterFeatures.length > 0) {
          const clusterId = clusterFeatures[0].properties?.cluster_id;
          const source = map.getSource('farm-centers') as any;
          if (source && clusterId != null) {
            source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
              if (!err) map.easeTo({ center: (clusterFeatures[0].geometry as any).coordinates, zoom });
            });
          }
          return;
        }

        // Check for marker click
        const markerFeatures = map.queryRenderedFeatures(e.point, { layers: ['farm-markers'] });
        if (markerFeatures.length > 0 && markerFeatures[0].properties?.id) {
          const farm = p.farms.find(f => f.id === markerFeatures[0].properties?.id);
          if (farm) { p.onFarmClick(farm); return; }
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['farm-fill', 'farm-line', 'district-fill'].filter(l => map.getLayer(l))
        });

        const farmFeature = features.find(f => f.layer.id === 'farm-fill' || f.layer.id === 'farm-line');
        const districtFeature = features.find(f => f.layer.id === 'district-fill');

        if (farmFeature && farmFeature.properties?.id) {
          const farm = p.farms.find(f => f.id === farmFeature.properties?.id);
          if (farm) p.onFarmClick(farm);
        } else if (districtFeature && districtFeature.properties?.id) {
          const district = p.districts.find(d => d.id === districtFeature.properties?.id);
          if (district) p.onDistrictClick(district);
        } else {
          p.onMapClick();
        }
      });

      map.on('mousemove', (e) => {
        const p = propsRef.current;
        if (p.isDrawingMode || p.isEditingMode) {
          setHoveredFarmId(null);
          hoveredFarmIdRef.current = null;
          map.getCanvas().style.cursor = 'crosshair';
          return;
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['farm-fill', 'farm-line', 'district-fill'].filter(l => map.getLayer(l))
        });

        const farmFeature = features.find(f => f.layer.id === 'farm-fill' || f.layer.id === 'farm-line');
        const districtFeature = features.find(f => f.layer.id === 'district-fill');

        if (farmFeature && farmFeature.properties?.id) {
          const id = farmFeature.properties.id as string;
          if (hoveredFarmIdRef.current !== id) {
             setHoveredFarmId(id);
             hoveredFarmIdRef.current = id;
          }
          map.getCanvas().style.cursor = 'pointer';
        } else {
          if (hoveredFarmIdRef.current !== null) {
             setHoveredFarmId(null);
             hoveredFarmIdRef.current = null;
          }
          if (districtFeature) {
            map.getCanvas().style.cursor = 'pointer';
          } else {
            map.getCanvas().style.cursor = '';
          }
        }
      });

      map.on('mouseleave', 'farm-fill', () => {
        setHoveredFarmId(null);
        hoveredFarmIdRef.current = null;
        map.getCanvas().style.cursor = '';
      });
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once to mount/unmount map

  // Sync external center/zoom
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: [center[1], center[0]], zoom, duration: 1500 });
  }, [center, zoom]);

  const prevStyleRef = useRef<string>(mapStyle);

  // Sync style — simplified to avoid race conditions
  useEffect(() => {
    if (!mapRef.current) return;
    if (prevStyleRef.current === mapStyle) return;
    
    prevStyleRef.current = mapStyle;
    const map = mapRef.current;
    
    const applyLayers = () => {
      if (addSourcesAndLayersRef.current && mapRef.current) {
        addSourcesAndLayersRef.current(mapRef.current);
      }
    };
    
    map.once('style.load', applyLayers);
    map.setStyle(mapboxStyleUrl, { diff: false });
  }, [mapStyle, mapboxStyleUrl]);

  // Dedicated effect for district/region boundaries — use external high-quality GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addBoundaries = async () => {
      if (!map.isStyleLoaded()) return;

      // Remove old layers
      ['boundary-fill', 'boundary-line', 'boundary-label', 'region-fill', 'region-line', 'region-label'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ['boundary-data', 'region-data'].forEach(id => {
        if (map.getSource(id)) map.removeSource(id);
      });

      const show = activeLayers.includes('boundaries');

      // Use GEE data if available (districts)
      if (districtsGeoJSON.features.length > 3) {
        map.addSource('boundary-data', { type: 'geojson', data: districtsGeoJSON as any });

        map.addLayer({
          id: 'boundary-line',
          type: 'line',
          source: 'boundary-data',
          minzoom: 8,
          paint: {
            'line-color': '#f59e0b',
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 11, 1.5, 13, 2],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 10, 0.6, 12, 0.8],
          },
          layout: { visibility: show ? 'visible' : 'none' },
        });

        map.addLayer({
          id: 'boundary-label',
          type: 'symbol',
          source: 'boundary-data',
          minzoom: 9,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9, 12, 12],
            'text-allow-overlap': false,
            'text-padding': 15,
            visibility: show ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#fbbf24',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1.5,
          },
        });
      }

      // Regions
      if (regionsGeoJSON.features.length > 0) {
        map.addSource('region-data', { type: 'geojson', data: regionsGeoJSON as any });

        map.addLayer({
          id: 'region-line',
          type: 'line',
          source: 'region-data',
          maxzoom: 9,
          paint: {
            'line-color': '#c084fc',
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 2],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 0.3, 9, 0],
          },
          layout: { visibility: show ? 'visible' : 'none' },
        });

        map.addLayer({
          id: 'region-label',
          type: 'symbol',
          source: 'region-data',
          minzoom: 5,
          maxzoom: 9,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 13],
            'text-allow-overlap': false,
            'text-padding': 20,
            visibility: show ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#c084fc',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1.5,
          },
        });
      }
    };

    const tryAdd = () => { if (map.isStyleLoaded()) addBoundaries(); };
    tryAdd();
    map.once('idle', tryAdd);
    const timer = setTimeout(tryAdd, 1500);
    return () => clearTimeout(timer);
  }, [districtsGeoJSON, regionsGeoJSON, activeLayers, mapStyle]);

  // Update data sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const doUpdate = () => {
      if (!map.isStyleLoaded()) return;

      const districtSource = map.getSource('districts') as mapboxgl.GeoJSONSource;
      if (districtSource) districtSource.setData(districtsGeoJSON as any);

      const farmSource = map.getSource('farms') as mapboxgl.GeoJSONSource;
      if (farmSource) farmSource.setData(farmsGeoJSON as any);

      const farmCentersSource = map.getSource('farm-centers') as mapboxgl.GeoJSONSource;
      if (farmCentersSource) farmCentersSource.setData(farmCentersGeoJSON as any);

      const drawingSource = map.getSource('drawing') as mapboxgl.GeoJSONSource;
      if (drawingSource) drawingSource.setData(drawingGeoJSON as any);

      // Toggle boundary visibility
      const showBoundaries = activeLayers.includes('boundaries');
      ['boundary-fill', 'boundary-line', 'boundary-label', 'region-line', 'region-label'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', showBoundaries ? 'visible' : 'none');
        }
      });

      // Update hover opacity
      if (map.getLayer('farm-fill')) {
        map.setPaintProperty('farm-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'id'], hoveredFarmIdRef.current || ''], 0.7,
          ['boolean', ['get', 'isVerification'], false], 0.3,
          0.4
        ]);
      }
      if (map.getLayer('farm-line')) {
        map.setPaintProperty('farm-line', 'line-width', [
          'case',
          ['==', ['get', 'id'], hoveredFarmIdRef.current || ''], 4,
          2.5
        ]);
      }
    };

    // Try immediately, and also on next style load in case style isn't ready
    doUpdate();
    map.once('idle', doUpdate);
  }, [districtsGeoJSON, farmsGeoJSON, farmCentersGeoJSON, drawingGeoJSON, hoveredFarmId, activeLayers]);

  const hoveredFarm = useMemo(() => {
    if (!hoveredFarmId) return null;
    return farms.find(f => f.id === hoveredFarmId);
  }, [hoveredFarmId, farms]);

  return (
    <div className="w-full h-full relative isolate">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Farm hover tooltip */}
      {hoveredFarm && (
        <div className="absolute top-6 left-6 bg-[#0a0a0a]/95 backdrop-blur-md text-white/90 p-3 rounded-xl border border-white/5 pointer-events-none z-50 shadow-2xl">
          <div className="font-mono text-[10px] text-emerald-400/80 mb-1 uppercase">Farm {hoveredFarm.id.slice(0, 8)}</div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-white/40">Status</span>
              <span style={{ color: getStatusColor(hoveredFarm.status) }}>{getStatusLabel(hoveredFarm.status)}</span>
            </div>
            {hoveredFarm.area && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">Area</span>
                <span>{hoveredFarm.area.toFixed(2)} ha</span>
              </div>
            )}
            {hoveredFarm.yield && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">Est. Yield</span>
                <span className="text-emerald-400 font-medium">{hoveredFarm.yield.toFixed(1)} t/ha</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Offline mode indicator */}
      {isOffline && (
        <div className="absolute top-4 right-4 bg-orange-900/80 backdrop-blur text-white px-3 py-1.5 rounded-full text-xs border border-orange-500/30 z-10">
          Vector Mode (Offline)
        </div>
      )}
    </div>
  );
};

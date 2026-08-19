import React, { useRef, useEffect } from 'react';
import type { PixelGrid } from '@/app/services/api';

interface HealthGradientOverlayProps {
  /** Per-pixel NDVI grid data from the analysis API */
  pixelGrid: PixelGrid;
  /** Geographic bounding box [minLng, minLat, maxLng, maxLat] */
  bounds: [number, number, number, number];
  /** CSS style overrides for positioning (left, top, width, height) */
  style?: React.CSSProperties;
  /** Opacity of the overlay (0–1) */
  opacity?: number;
}

/** Maximum canvas dimension to prevent performance issues */
const MAX_DIM = 200;

/**
 * Maps an NDVI value to an RGB color on a red → yellow → green gradient.
 *  - NDVI < 0.3  → red   (poor health)
 *  - NDVI 0.3–0.6 → yellow (moderate)
 *  - NDVI > 0.6  → green (healthy)
 */
function ndviToColor(ndvi: number): [number, number, number] {
  // Clamp to valid range
  const v = Math.max(0, Math.min(1, ndvi));

  if (v < 0.3) {
    // Red to yellow transition (0 → 0.3)
    const t = v / 0.3;
    return [220, Math.round(60 + t * 160), Math.round(30 * t)];
  } else if (v < 0.6) {
    // Yellow to green transition (0.3 → 0.6)
    const t = (v - 0.3) / 0.3;
    return [Math.round(220 * (1 - t)), Math.round(220 - t * 30), Math.round(30 + t * 100)];
  } else {
    // Green (0.6 → 1.0)
    const t = (v - 0.6) / 0.4;
    return [Math.round(20 * (1 - t)), Math.round(190 + t * 40), Math.round(130 - t * 30)];
  }
}

/**
 * Downsample a 2D grid to fit within MAX_DIM × MAX_DIM using nearest-neighbor.
 */
function downsample(grid: number[][], maxDim: number): number[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows <= maxDim && cols <= maxDim) return grid;

  const scaleR = Math.ceil(rows / maxDim);
  const scaleC = Math.ceil(cols / maxDim);
  const newRows = Math.ceil(rows / scaleR);
  const newCols = Math.ceil(cols / scaleC);

  const result: number[][] = [];
  for (let r = 0; r < newRows; r++) {
    const row: number[] = [];
    for (let c = 0; c < newCols; c++) {
      row.push(grid[Math.min(r * scaleR, rows - 1)][Math.min(c * scaleC, cols - 1)]);
    }
    result.push(row);
  }
  return result;
}

/**
 * HealthGradientOverlay renders a per-pixel NDVI grid as a colored canvas
 * overlay. It uses a green-to-red gradient where green = high NDVI (healthy)
 * and red = low NDVI (poor health).
 *
 * The component is absolutely positioned and intended to be placed over a map
 * container. The parent must provide positioning via the `style` prop or CSS.
 *
 * Requirement 2.4: Render pixel_grid data as a colored overlay on the map polygon.
 */
export const HealthGradientOverlay: React.FC<HealthGradientOverlayProps> = ({
  pixelGrid,
  bounds,
  style,
  opacity = 0.7,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const grid = downsample(pixelGrid.ndvi_grid, MAX_DIM);
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return;

    canvas.width = cols;
    canvas.height = rows;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(cols, rows);
    const data = imageData.data;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ndvi = grid[r][c];
        const idx = (r * cols + c) * 4;

        // Treat NaN / very negative values as transparent (no data)
        if (ndvi == null || isNaN(ndvi) || ndvi < -0.5) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        } else {
          const [red, green, blue] = ndviToColor(ndvi);
          data[idx] = red;
          data[idx + 1] = green;
          data[idx + 2] = blue;
          data[idx + 3] = Math.round(255 * opacity);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [pixelGrid, opacity]);

  return (
    <canvas
      ref={canvasRef}
      data-bounds={JSON.stringify(bounds)}
      style={{
        position: 'absolute',
        imageRendering: 'pixelated',
        pointerEvents: 'none',
        ...style,
      }}
      aria-label={`NDVI health gradient overlay (${pixelGrid.rows}×${pixelGrid.cols} pixels)`}
    />
  );
};

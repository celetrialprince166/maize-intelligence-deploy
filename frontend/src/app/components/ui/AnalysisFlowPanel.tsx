import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ShieldCheck, Loader2, Sprout, TrendingUp, BarChart3, Activity, FileText, Download, ChevronDown, Table as TableIcon } from 'lucide-react';
import { Farm, DataService } from '@/app/services/storage';
import { MaizeAPI } from '@/app/services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toPng } from 'html-to-image';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid, Legend } from 'recharts';

interface AnalysisFlowPanelProps {
  farms: Farm[];
  activeSeason?: number;
  onComplete: () => void;
  onClose?: () => void;
  onSelectFarm: (farm: Farm) => void;
  onDataUpdate?: () => void;
}

type Step = 'validating' | 'analyzing' | 'predicting' | 'results';

/**
 * Maps an NDVI value to an RGB color on a red → yellow → green gradient.
 * Reuses the same logic as HealthGradientOverlay.
 */
function ndviToColor(ndvi: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, ndvi));
  if (v < 0.3) {
    const t = v / 0.3;
    return [220, Math.round(60 + t * 160), Math.round(30 * t)];
  } else if (v < 0.6) {
    const t = (v - 0.3) / 0.3;
    return [Math.round(220 * (1 - t)), Math.round(220 - t * 30), Math.round(30 + t * 100)];
  } else {
    const t = (v - 0.6) / 0.4;
    return [Math.round(20 * (1 - t)), Math.round(190 + t * 40), Math.round(130 - t * 30)];
  }
}

/** Assign a district name based on farm center latitude (same logic as DashboardView). */
function assignDistrict(center: [number, number]): string {
  const lat = center[0];
  const lng = center[1];
  if (lat >= 9.70 && lat <= 9.90 && lng >= -0.55 && lng <= -0.35) return 'Gushegu';
  if (lat >= 9.50 && lat <= 9.65 && lng >= -0.85 && lng <= -0.70) return 'Nanton';
  if (lat >= 9.30 && lat <= 9.55 && lng >= -0.95 && lng <= -0.70) return 'Tamale';
  if (lat >= 9.0 && lat <= 11.0) return 'Northern Region';
  if (lat >= 5.4 && lat <= 6.2 && lng >= -0.5 && lng <= 0.5) return 'Greater Accra';
  if (lat >= 7.5 && lat <= 9.0) return 'Bono / Ashanti';
  return 'Other Region';
}

/**
 * Render a pixel_grid NDVI array to a base64 PNG string using an offscreen canvas.
 */
function renderNdviGridToBase64(pixelGrid: { ndvi_grid: number[][]; rows: number; cols: number }): string | null {
  try {
    const grid = pixelGrid.ndvi_grid;
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(cols, rows);
    const data = imageData.data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ndvi = grid[r][c];
        const idx = (r * cols + c) * 4;
        if (ndvi == null || isNaN(ndvi) || ndvi < -0.5) {
          data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 0;
        } else {
          const [red, green, blue] = ndviToColor(ndvi);
          data[idx] = red; data[idx + 1] = green; data[idx + 2] = blue; data[idx + 3] = 200;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export const AnalysisFlowPanel: React.FC<AnalysisFlowPanelProps> = ({ farms, activeSeason, onComplete, onClose, onSelectFarm, onDataUpdate }) => {
  const [currentStep, setCurrentStep] = useState<Step>('validating');
  const [processedFarms, setProcessedFarms] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0, elapsed: 0 });
  const [queuedFarms, setQueuedFarms] = useState<Farm[]>([]);
  const [isCancelled, setIsCancelled] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const timeSeriesChartRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const isRunningRef = useRef(false);
  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Max farms to process in one batch — prevents overwhelming the backend
  const MAX_BATCH = 10;

  // Elapsed timer for analysis step
  useEffect(() => {
    if (currentStep === 'analyzing') {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setAnalysisProgress(prev => ({ ...prev, elapsed: Math.floor((Date.now() - start) / 1000) }));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentStep]);

  // Detect new farms added while analysis is running (queue system)
  useEffect(() => {
    const newFarms = farms.filter(f => !processedIdsRef.current.has(f.id));
    if (newFarms.length > 0) {
      // Mark them as known
      newFarms.forEach(f => processedIdsRef.current.add(f.id));
      
      if (isRunningRef.current) {
        // Analysis is already running — queue these farms
        setQueuedFarms(prev => [...prev, ...newFarms]);
      }
    }
  }, [farms]);

  // Process queued farms when current analysis finishes (only if not cancelled)
  useEffect(() => {
    if (currentStep === 'results' && queuedFarms.length > 0 && !isCancelled) {
      const batch = [...queuedFarms];
      setQueuedFarms([]);
      setCurrentStep('validating');
      setTimeout(() => {
        runAnalysis(batch);
      }, 500);
    }
  }, [currentStep, queuedFarms, isCancelled]);

  const runAnalysis = async (farmsToAnalyze: Farm[]) => {
    isRunningRef.current = true;
    cancelledRef.current = false;
    setIsCancelled(false);

    // Create a new abort controller for this run
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Limit to MAX_BATCH farms per run
    const batch = farmsToAnalyze.slice(0, MAX_BATCH);
    const skipped = farmsToAnalyze.slice(MAX_BATCH);
    if (skipped.length > 0) {
      setQueuedFarms(prev => [...prev, ...skipped]);
    }

    // 1. Validating geometry
    setCurrentStep('validating');
    await new Promise(r => setTimeout(r, 800));
    if (cancelledRef.current) { isRunningRef.current = false; return; }

    // 2. Satellite Analysis
    setCurrentStep('analyzing');

    const results: any[] = [];
    setAnalysisProgress({ current: 0, total: batch.length, elapsed: 0 });
    for (let fi = 0; fi < batch.length; fi++) {
      if (cancelledRef.current) break;

      const farm = batch[fi];
      setAnalysisProgress(prev => ({ ...prev, current: fi + 1 }));
      let geometry: any = null;
      if (farm.coordinates && farm.coordinates.length >= 3) {
        const coords = farm.coordinates.map(c => [c[1], c[0]]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
          coords.push([...coords[0]]);
        }
        geometry = { type: 'Polygon', coordinates: [coords] };
      }

      if (!geometry) {
        results.push({ ...farm, confidence: 0, isMaize: false, needsReview: false, apiResult: null, health: 'N/A', predictedYield: 0 });
        continue;
      }

      try {
        const apiResult = await MaizeAPI.analyze(
          { geometry, name: farm.name || 'Farm', season_year: activeSeason },
          signal,
        );
        if (cancelledRef.current) break;
        const confPct = Math.round(apiResult.confidence * 100);
        results.push({
          ...farm, confidence: confPct, isMaize: apiResult.is_maize,
          needsReview: false, forcePredict: true, apiResult,
          health: apiResult.health_status ? apiResult.health_status.charAt(0).toUpperCase() + apiResult.health_status.slice(1) : 'N/A',
          predictedYield: apiResult.yield_mt_ha?.toFixed(1) || 0,
        });
      } catch (err: any) {
        if (err.name === 'AbortError' || cancelledRef.current) {
          results.push({ ...farm, confidence: 0, isMaize: false, apiResult: null, health: 'N/A', predictedYield: 0, error: 'Cancelled' });
          break;
        }
        results.push({
          ...farm, confidence: 0, isMaize: false, needsReview: false,
          apiResult: null, health: 'N/A', predictedYield: 0,
          error: err.message?.includes('timeout') ? 'Timed out' : 'Failed',
        });
      }
    }

    if (cancelledRef.current) {
      // Clear the queue too — user wants to stop everything
      setQueuedFarms([]);
      setProcessedFarms(prev => [...prev, ...results]);
      setCurrentStep('results');
      isRunningRef.current = false;
      return;
    }

    // Merge with existing processed farms
    setProcessedFarms(prev => [...prev, ...results]);
    finalizePredictions(results);
    isRunningRef.current = false;
  };

  useEffect(() => {
    if (farms.length > 0 && currentStep === 'validating' && !isRunningRef.current) {
      const initialFarms = farms.filter(f => !processedIdsRef.current.has(f.id) || processedIdsRef.current.size === 0);
      // Mark all initial farms
      farms.forEach(f => processedIdsRef.current.add(f.id));
      if (initialFarms.length > 0) {
        runAnalysis(initialFarms);
      } else {
        runAnalysis(farms);
      }
    }
  }, []);

  const finalizePredictions = async (farmsToFinalize: any[]) => {
    setCurrentStep('predicting');
    
    // Update the data service with real API results including time-series data
    for (const f of farmsToFinalize) {
      if (f.id) {
        const year = activeSeason || new Date().getFullYear();
        try {
          await DataService.updateFarmAnalysis(f.id, year, {
            status: f.isMaize ? 'maize' : 'non-maize',
            yield: parseFloat(f.predictedYield as string) || 0,
            confidence: (f.confidence || 0) / 100,
            area: f.apiResult?.area_ha,
            time_series: f.apiResult?.time_series,
            pixel_grid: f.apiResult?.pixel_grid,
            ancillary: f.apiResult?.ancillary,
            comparison: f.apiResult?.comparison,
          });
        } catch (err) {
          console.error(`Failed to store analysis for farm ${f.id}:`, err);
        }
      }
    }

    setProcessedFarms(farmsToFinalize);
    if (onDataUpdate) {
      try { onDataUpdate(); } catch (e) { console.error("Error updating data", e); }
    }
    await new Promise(r => setTimeout(r, 1500));
    setCurrentStep('results');
  };

  const exportCSV = () => {
    const headers = ['Farm Name', 'Confidence (%)', 'Status', 'Health', 'Est. Yield (t/ha)'];
    const rows = processedFarms.map(f => [
      `"${f.name || 'Unnamed Farm'}"`,
      f.confidence || '',
      (f.isMaize || f.forcePredict) ? 'Verified' : 'Non-Maize',
      (f.isMaize || f.forcePredict) ? (f.health || 'N/A') : '',
      (f.isMaize || f.forcePredict) ? f.predictedYield : ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Maize_Data_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportPDF = async (type: 'summary' | 'detailed') => {
    setIsExporting(type === 'detailed' ? 'Detailed PDF' : 'Summary PDF');
    try {
      const doc = new jsPDF();
      
      // Aesthetic dark theme for the PDF
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, 210, 297, 'F');

      // Header
      doc.setTextColor(16, 185, 129); // Emerald 500
      doc.setFontSize(24);
      doc.text('Maize Yield & Farm Verification', 14, 25);
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text(type === 'detailed' ? 'Detailed Analysis Report' : 'Post-Analysis Summary', 14, 33);
      
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 40);

      // --- Task 14.4: Enhanced Executive Summary with district aggregation ---
      const maizeCount = processedFarms.filter(f => f.isMaize || f.forcePredict).length;
      const verifiedFarms = processedFarms.filter(f => f.isMaize || f.forcePredict);
      const avgYield = verifiedFarms.reduce((acc, f) => acc + (parseFloat(f.predictedYield) || 0), 0) / (maizeCount || 1);
      const verificationRate = processedFarms.length > 0 ? ((maizeCount / processedFarms.length) * 100).toFixed(1) : '0.0';

      // District grouping
      const districtMap: Record<string, { farms: any[]; totalYield: number; count: number }> = {};
      processedFarms.forEach(f => {
        const district = f.center ? assignDistrict(f.center) : 'Unknown';
        if (!districtMap[district]) districtMap[district] = { farms: [], totalYield: 0, count: 0 };
        districtMap[district].farms.push(f);
        districtMap[district].count++;
        if (f.isMaize || f.forcePredict) {
          districtMap[district].totalYield += parseFloat(f.predictedYield) || 0;
        }
      });

      // Summary box — taller to fit district info in detailed mode
      const summaryBoxHeight = type === 'detailed' ? 52 : 35;
      doc.setFillColor(25, 25, 25);
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.roundedRect(14, 48, 182, summaryBoxHeight, 3, 3, 'FD');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text('Executive Summary', 18, 56);
      
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(10);
      doc.text(`Total Farms Analyzed: ${processedFarms.length}`, 18, 65);
      doc.text(`Verified Maize Farms: ${maizeCount}`, 18, 71);
      doc.text(`Average Predicted Yield: ${avgYield.toFixed(2)} t/ha`, 18, 77);

      if (type === 'detailed') {
        doc.text(`Verification Rate: ${verificationRate}%`, 18, 83);
        // District-level aggregation line
        const districtSummaryParts = Object.entries(districtMap).map(([name, d]) => {
          const dAvg = d.count > 0 ? (d.totalYield / d.count).toFixed(1) : '0.0';
          return `${name}: ${d.count} farms, avg ${dAvg} t/ha`;
        });
        const districtLine = districtSummaryParts.join('  |  ');
        doc.setFontSize(9);
        doc.setTextColor(16, 185, 129);
        doc.text('District Breakdown:', 18, 91);
        doc.setTextColor(160, 160, 160);
        doc.text(districtLine, 18, 97);
      }

      // --- Task 14.2: Enhanced per-farm analytics table with comparison columns ---
      const tableStartY = 48 + summaryBoxHeight + 7;

      const tableHead = type === 'detailed'
        ? [['Farm Name', 'Area (ha)', 'Confidence (%)', 'Yield (t/ha)', 'Health', 'NDVI', 'District Comp.']]
        : [['Farm Name', 'Confidence', 'Status', 'Health', 'Est. Yield']];

      const tableBody = processedFarms.map(f => {
        const isVerified = f.isMaize || f.forcePredict;
        if (type === 'detailed') {
          const area = f.apiResult?.area_ha != null ? f.apiResult.area_ha.toFixed(1) : (f.area ? f.area.toFixed(1) : 'N/A');
          const ndvi = f.apiResult?.indices?.ndvi != null ? f.apiResult.indices.ndvi.toFixed(3) : 'N/A';
          let distComp = 'N/A';
          if (f.apiResult?.comparison) {
            const delta = (parseFloat(f.predictedYield) || 0) - (f.apiResult.comparison.district_avg_yield || 0);
            distComp = delta >= 0 ? `+${delta.toFixed(1)} above avg` : `${delta.toFixed(1)} below avg`;
          }
          return [
            f.name || 'Unnamed Farm',
            area,
            f.confidence ? `${f.confidence}` : 'N/A',
            isVerified ? `${f.predictedYield}` : '-',
            isVerified ? (f.health || 'N/A') : '-',
            isVerified ? ndvi : '-',
            isVerified ? distComp : '-',
          ];
        }
        return [
          f.name || 'Unnamed Farm',
          f.confidence ? `${f.confidence}%` : 'N/A',
          isVerified ? 'Verified' : 'Non-Maize',
          isVerified ? (f.health || 'N/A') : '-',
          isVerified ? `${f.predictedYield} t/ha` : '-',
        ];
      });

      autoTable(doc, {
        startY: tableStartY,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        headStyles: { 
          fillColor: [16, 185, 129], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: type === 'detailed' ? 8 : 10,
        },
        styles: { 
          fillColor: [30, 30, 30], 
          textColor: 220, 
          lineColor: [50, 50, 50],
          lineWidth: 0.1,
          fontSize: type === 'detailed' ? 8 : 10,
        },
        alternateRowStyles: { 
          fillColor: [22, 22, 22] 
        },
        margin: { left: 14, right: 14 },
      });

      let currentY = (doc as any).lastAutoTable?.finalY || tableStartY + 40;

      // --- Detailed report enhancements (Tasks 14.1, 14.3) ---
      if (type === 'detailed') {

        // --- Task 14.1: Satellite thumbnail and NDVI gradient map per farm ---
        const farmsWithImages = processedFarms.filter(
          f => (f.isMaize || f.forcePredict) && (f.apiResult?.true_color_thumbnail || f.apiResult?.pixel_grid)
        );

        if (farmsWithImages.length > 0) {
          // Check if we need a new page
          if (currentY + 30 > 270) {
            doc.addPage();
            doc.setFillColor(15, 15, 15);
            doc.rect(0, 0, 210, 297, 'F');
            currentY = 20;
          }

          doc.setTextColor(255, 255, 255);
          doc.setFontSize(14);
          doc.text('Per-Farm Satellite & NDVI Imagery', 14, currentY + 10);
          currentY += 18;

          for (const farm of farmsWithImages) {
            // Each farm section needs ~60px height for images
            if (currentY + 65 > 275) {
              doc.addPage();
              doc.setFillColor(15, 15, 15);
              doc.rect(0, 0, 210, 297, 'F');
              currentY = 20;
            }

            doc.setTextColor(16, 185, 129);
            doc.setFontSize(10);
            doc.text(farm.name || 'Unnamed Farm', 14, currentY);
            currentY += 5;

            let imgX = 14;

            // Satellite thumbnail
            if (farm.apiResult?.true_color_thumbnail) {
              try {
                const thumbData = farm.apiResult.true_color_thumbnail.startsWith('data:')
                  ? farm.apiResult.true_color_thumbnail
                  : `data:image/png;base64,${farm.apiResult.true_color_thumbnail}`;
                doc.addImage(thumbData, 'PNG', imgX, currentY, 50, 50);
                doc.setTextColor(120, 120, 120);
                doc.setFontSize(7);
                doc.text('True Color', imgX, currentY + 54);
                imgX += 56;
              } catch {
                // Skip if image fails to embed
              }
            }

            // NDVI gradient map from pixel_grid
            if (farm.apiResult?.pixel_grid) {
              const ndviBase64 = renderNdviGridToBase64(farm.apiResult.pixel_grid);
              if (ndviBase64) {
                try {
                  doc.addImage(ndviBase64, 'PNG', imgX, currentY, 50, 50);
                  doc.setTextColor(120, 120, 120);
                  doc.setFontSize(7);
                  doc.text('NDVI Health Map', imgX, currentY + 54);
                } catch {
                  // Skip if image fails to embed
                }
              }
            }

            currentY += 60;
          }
        }

        // --- Task 14.3: NDVI time-series chart ---
        const farmsWithTimeSeries = processedFarms.filter(
          f => f.apiResult?.time_series && f.apiResult.time_series.length >= 2
        );

        if (farmsWithTimeSeries.length > 0 && timeSeriesChartRef.current) {
          try {
            const tsImgData = await toPng(timeSeriesChartRef.current, {
              backgroundColor: '#0a0a0a',
              pixelRatio: 2,
            });
            const tsImgProps = doc.getImageProperties(tsImgData);
            const pdfWidth = 182;
            const pdfHeight = (tsImgProps.height * pdfWidth) / tsImgProps.width;

            if (currentY + 20 + pdfHeight > 280) {
              doc.addPage();
              doc.setFillColor(15, 15, 15);
              doc.rect(0, 0, 210, 297, 'F');
              currentY = 20;
            }

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.text('NDVI Time-Series Trend', 14, currentY + 10);
            doc.addImage(tsImgData, 'PNG', 14, currentY + 15, pdfWidth, pdfHeight);
            currentY += 20 + pdfHeight;
          } catch {
            // Skip time-series chart if capture fails
          }
        }

        // Yield distribution bar chart (existing)
        if (chartRef.current) {
          try {
            const imgData = await toPng(chartRef.current, { 
              backgroundColor: '#0a0a0a', 
              pixelRatio: 2 
            });
            const imgProps = doc.getImageProperties(imgData);
            const pdfWidth = 182;
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            if (currentY + 20 + pdfHeight > 280) {
              doc.addPage();
              doc.setFillColor(15, 15, 15);
              doc.rect(0, 0, 210, 297, 'F');
              currentY = 20;
            }

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.text('Yield Distribution Chart', 14, currentY + 10);
            doc.addImage(imgData, 'PNG', 14, currentY + 15, pdfWidth, pdfHeight);
            currentY += 20 + pdfHeight;
          } catch {
            // Skip chart if capture fails
          }
        }
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Page ${i} of ${pageCount} • Maize Yield Platform`,
          doc.internal.pageSize.width / 2, 
          285, 
          { align: 'center' }
        );
      }

      doc.save(`Maize_${type === 'detailed' ? 'Detailed' : 'Summary'}_Report_${Date.now()}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-white/10 bg-[#0a0a0a]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white mb-1">Maize Analysis Engine</h2>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Activity size={12} className="text-emerald-500" />
              <span>
                {currentStep === 'results' 
                  ? `${processedFarms.length} farm${processedFarms.length !== 1 ? 's' : ''} analyzed`
                  : `Processing ${analysisProgress.current}/${analysisProgress.total}`
                }
              </span>
              {queuedFarms.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">
                  +{queuedFarms.length} queued
                </span>
              )}
              {isCancelled && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                  Cancelled
                </span>
              )}
            </div>
            {analysisProgress.total > 10 && currentStep === 'analyzing' && (
              <div className="text-[10px] text-amber-400/70 mt-1">
                ⚠️ Large batch — each farm takes 30-60s. Consider processing in smaller groups.
              </div>
            )}
          </div>
          {currentStep === 'analyzing' && !isCancelled && (
            <button
              onClick={() => { 
                cancelledRef.current = true; 
                setIsCancelled(true); 
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
              }}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-500/30 transition-colors"
            >
              Stop
            </button>
          )}
          {/* Close/dismiss button — always visible */}
          {onClose && (currentStep === 'results' || isCancelled || currentStep !== 'analyzing') && (
            <button
              onClick={() => {
                cancelledRef.current = true;
                if (abortControllerRef.current) abortControllerRef.current.abort();
                onClose();
              }}
              className="px-3 py-1.5 bg-white/5 text-white/60 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/50">
        
        {/* Step 1: Validation */}
        <StatusItem 
          title="Geometry Validation" 
          active={currentStep === 'validating'} 
          done={currentStep !== 'validating'} 
          icon={<ShieldCheck size={16} />} 
        />
        
        {/* Step 2: Satellite Analysis */}
        <StatusItem 
          title="Crop Classification" 
          active={currentStep === 'analyzing'} 
          done={['predicting', 'results'].includes(currentStep)} 
          icon={<Sprout size={16} />}
          subtitle={currentStep === 'analyzing' && analysisProgress.total > 0 
            ? `Analyzing farm ${analysisProgress.current}/${analysisProgress.total} (${analysisProgress.elapsed}s elapsed)`
            : undefined
          }
        >
          {['analyzing', 'predicting', 'results'].includes(currentStep) && (
            <div className="mt-3 space-y-2">
              {processedFarms.map((farm, i) => (
                <div key={i} className="flex flex-col gap-2 p-2 rounded bg-white/5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/70 truncate w-24">{farm.name || `Farm ${i+1}`}</span>
                    {currentStep === 'analyzing' && !farm.confidence ? (
                       <Loader2 size={12} className="animate-spin text-emerald-500" />
                    ) : (
                       <div className="flex items-center gap-2">
                         <span className={
                           farm.confidence >= 70 ? "text-emerald-400" : 
                           farm.confidence >= 40 ? "text-yellow-500" : "text-red-400"
                         }>
                           {farm.isMaize ? 'Maize' : 'Non-Maize'}
                         </span>
                         <span className="text-white/40">{farm.confidence}%</span>
                       </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatusItem>

        {/* Step 3: Prediction */}
        <StatusItem 
          title="Yield Prediction & Health" 
          active={currentStep === 'predicting'} 
          done={currentStep === 'results'} 
          icon={<TrendingUp size={16} />} 
        >
          {['predicting', 'results'].includes(currentStep) && (
            <div className="mt-3 space-y-2">
              {processedFarms.map((farm, i) => (
                (farm.isMaize || farm.forcePredict) && (
                  <div key={i} className="flex justify-between items-center text-xs p-2 rounded bg-white/5 border-l-2 border-emerald-500">
                    <span className="text-white/70 truncate w-20">{farm.name || `Farm ${i+1}`}</span>
                    {currentStep === 'predicting' ? (
                       <Loader2 size={12} className="animate-spin text-emerald-500" />
                    ) : (
                       <div className="flex items-center gap-3">
                         <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                           farm.health === 'Good' ? 'bg-emerald-500/20 text-emerald-400' : 
                           farm.health === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400' : 
                           'bg-red-500/20 text-red-400'
                         }`}>
                           {farm.health}
                         </span>
                         <span className="text-white/90 font-mono">{farm.predictedYield} t/ha</span>
                       </div>
                    )}
                  </div>
                )
              ))}
            </div>
          )}
        </StatusItem>

        {/* Step 4: Results */}
        {currentStep === 'results' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-3"
          >
            <div className="text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-1" />
              <h3 className="text-emerald-400 font-medium text-sm">Analysis Complete</h3>
            </div>
            
            {/* Compact results summary */}
            <div className="space-y-1.5">
              {processedFarms.filter(f => f.isMaize || f.forcePredict).map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-black/30 rounded-lg text-xs">
                  <span className="text-white/70 truncate max-w-[120px]">{f.name || 'Farm'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono">{f.predictedYield} t/ha</span>
                    <span className="text-white/30">{f.confidence}%</span>
                  </div>
                </div>
              ))}
              {processedFarms.filter(f => !f.isMaize && !f.forcePredict).length > 0 && (
                <div className="text-[10px] text-white/30 text-center">
                  {processedFarms.filter(f => !f.isMaize && !f.forcePredict).length} farm(s) classified as non-maize
                </div>
              )}
            </div>

            {/* Hidden charts for PDF export */}
            <div ref={chartRef} style={{ position: 'absolute', left: '-9999px', width: '400px', height: '150px' }} aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processedFarms.filter(f => f.isMaize || f.forcePredict).map(f => ({ name: f.name || 'Unnamed', yield: parseFloat(f.predictedYield) || 0 }))}>
                  <XAxis dataKey="name" stroke="#555" fontSize={9} />
                  <Bar dataKey="yield" fill="#10b981" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Hidden time-series chart for PDF export (Task 14.3) */}
            {processedFarms.some(f => f.apiResult?.time_series?.length >= 2) && (
              <div
                ref={timeSeriesChartRef}
                style={{ position: 'absolute', left: '-9999px', top: 0, width: '600px', height: '200px', background: '#0a0a0a', padding: '8px' }}
                aria-hidden="true"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(() => {
                      // Merge all farms' time-series by date
                      const dateMap: Record<string, Record<string, number>> = {};
                      processedFarms.forEach(f => {
                        if (!f.apiResult?.time_series) return;
                        f.apiResult.time_series.forEach((entry: any) => {
                          if (!dateMap[entry.date]) dateMap[entry.date] = { date: entry.date };
                          dateMap[entry.date][f.name || 'Farm'] = entry.ndvi;
                        });
                      });
                      return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
                    })()}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" stroke="#555" fontSize={9} tickLine={false} />
                    <YAxis stroke="#555" fontSize={9} domain={[0, 1]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #333', fontSize: '10px' }} />
                    <Legend wrapperStyle={{ fontSize: '9px', color: '#aaa' }} />
                    {processedFarms
                      .filter(f => f.apiResult?.time_series?.length >= 2)
                      .map((f, i) => (
                        <Line
                          key={i}
                          type="monotone"
                          dataKey={f.name || 'Farm'}
                          stroke={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]}
                          dot={false}
                          isAnimationActive={false}
                          strokeWidth={2}
                        />
                      ))
                    }
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex flex-col gap-2 relative">
              <button 
                onClick={onComplete}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                View Results Dashboard
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={isExporting !== null}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isExporting ? `Generating ${isExporting}...` : 'Export Data & Reports'}
                  <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                    {showExportMenu && (
                        <motion.div 
                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                            className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col"
                        >
                            <button onClick={() => { setShowExportMenu(false); exportPDF('summary'); }} className="flex items-center gap-3 p-3 hover:bg-white/5 text-left text-white/90 transition-colors border-b border-white/5">
                                <FileText size={16} className="text-emerald-500 shrink-0" />
                                <div>
                                    <div className="font-medium text-sm">Summary Report (PDF)</div>
                                    <div className="text-[10px] text-white/40">Clean overview of verified yields</div>
                                </div>
                            </button>
                            <button onClick={() => { setShowExportMenu(false); exportPDF('detailed'); }} className="flex items-center gap-3 p-3 hover:bg-white/5 text-left text-white/90 transition-colors border-b border-white/5">
                                <BarChart3 size={16} className="text-emerald-500 shrink-0" />
                                <div>
                                    <div className="font-medium text-sm">Detailed Report (PDF)</div>
                                    <div className="text-[10px] text-white/40">Includes visualization charts</div>
                                </div>
                            </button>
                            <button onClick={() => { setShowExportMenu(false); exportCSV(); }} className="flex items-center gap-3 p-3 hover:bg-white/5 text-left text-white/90 transition-colors">
                                <TableIcon size={16} className="text-emerald-500 shrink-0" />
                                <div>
                                    <div className="font-medium text-sm">Raw Data (CSV)</div>
                                    <div className="text-[10px] text-white/40">Spreadsheet formatted dataset</div>
                                </div>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* Queued Farms */}
        {queuedFarms.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <h4 className="text-xs font-medium text-yellow-400 mb-2 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Queued ({queuedFarms.length})
            </h4>
            <div className="space-y-1.5">
              {queuedFarms.map((farm, i) => (
                <button
                  key={farm.id || i}
                  onClick={() => onSelectFarm(farm)}
                  className="w-full flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 transition-colors text-left group"
                >
                  <span className="text-xs text-white/70 truncate">{farm.name || `Farm ${i + 1}`}</span>
                  <span className="text-[10px] text-yellow-400/60 group-hover:text-yellow-400 shrink-0 ml-2">Go to →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatusItem = ({ title, subtitle, active, done, icon, children }: any) => {
  return (
    <div className={`p-4 rounded-xl border transition-all duration-300 ${
      active ? 'bg-[#111] border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 
      done ? 'bg-white/5 border-white/10' : 
      'bg-transparent border-transparent opacity-40'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          done ? 'bg-emerald-500 text-black' : 
          active ? 'bg-emerald-500/20 text-emerald-500' : 
          'bg-white/10 text-white/40'
        }`}>
          {done ? <CheckCircle2 size={16} /> : active ? <Loader2 size={16} className="animate-spin" /> : icon}
        </div>
        <div>
          <h3 className={`font-medium ${active ? 'text-white' : done ? 'text-white/80' : 'text-white/40'}`}>
            {title}
          </h3>
          {subtitle && <p className="text-[10px] text-emerald-400/70 mt-0.5 font-mono">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
};

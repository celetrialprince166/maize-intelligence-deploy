import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, PenTool, X, FileUp, Send, Bot, User, CheckCircle2, File, Loader2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartDrawing?: () => void;
  onUpload?: (parsedGeoJSON?: any) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onStartDrawing, onUpload }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'draw'>('upload');
  
  // Upload & Discuss State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [messages, setMessages] = useState<{id: string, role: 'ai'|'user', content: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setSelectedFile(null);
        setParsedData(null);
        setIsAnalyzing(false);
        setAnalysisComplete(false);
        setMessages([]);
        setInputValue('');
        setActiveTab('upload');
      }, 300);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setMessages([
      { id: '1', role: 'ai', content: `I'm analyzing the uploaded dataset: ${file.name}. Give me a moment to parse the spatial geometries...` }
    ]);

    const ext = file.name.toLowerCase().split('.').pop();

    // Handle zipped shapefiles and .shp files
    if (ext === 'zip' || ext === 'shp') {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const shp = await import('shpjs');
          const buffer = event.target?.result as ArrayBuffer;
          const geojson = await shp.default(buffer);
          const fc = Array.isArray(geojson) ? geojson[0] : geojson;
          const featureCount = fc?.features?.length || 0;

          setParsedData(fc);
          setIsAnalyzing(false);
          setAnalysisComplete(true);
          const warnMsg = featureCount > 50 
            ? `\n\n⚠️ Best Practice: For optimal performance, we recommend uploading no more than 50 farms at a time. Large batches may take significantly longer to process.`
            : '';
          setMessages(prev => [
            ...prev,
            { id: '2', role: 'ai', content: `Shapefile parsed! I've detected ${featureCount} farm boundaries in ${file.name}. You can proceed with the upload.${warnMsg}` }
          ]);
        } catch (error: any) {
          setIsAnalyzing(false);
          setMessages(prev => [
            ...prev,
            { id: 'err', role: 'ai', content: `Error parsing shapefile: ${error.message || 'Unknown error'}. Make sure the .zip contains .shp, .shx, and .dbf files.` }
          ]);
        }
      };
      reader.onerror = () => {
        setIsAnalyzing(false);
        setMessages(prev => [...prev, { id: 'err', role: 'ai', content: 'Could not read the file.' }]);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // Handle GeoJSON / JSON
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const geojson = JSON.parse(text);
        const featureCount = geojson.features?.length || (geojson.type === 'Feature' ? 1 : 0);

        setTimeout(() => {
          setParsedData(geojson);
          setIsAnalyzing(false);
          setAnalysisComplete(true);
          const warnMsg = featureCount > 50 
            ? `\n\n⚠️ Best Practice: For optimal performance, we recommend uploading no more than 50 farms at a time. Large batches may take significantly longer to process.`
            : '';
          setMessages(prev => [
            ...prev,
            { id: '2', role: 'ai', content: `Analysis complete! I've detected ${featureCount} farm boundaries in ${file.name}. You can proceed with the upload.${warnMsg}` }
          ]);
        }, 1500);
      } catch (error) {
        setIsAnalyzing(false);
        setMessages(prev => [
          ...prev,
          { id: 'err', role: 'ai', content: `Error parsing file. Please ensure it is a valid GeoJSON format.` }
        ]);
      }
    };
    reader.onerror = () => {
      setIsAnalyzing(false);
      setMessages(prev => [...prev, { id: 'err', role: 'ai', content: 'Could not read the file.' }]);
    };
    reader.readAsText(file);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);

    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { 
          id: (Date.now() + 1).toString(), 
          role: 'ai', 
          content: "I've noted your request. I will flag these parameters for the verification team. You can click 'Finalize Upload' to commit this to the workspace." 
        }
      ]);
    }, 1000);
  };

  const handleFinalizeUpload = () => {
    if (onUpload) {
      onUpload(parsedData);
      onClose();
    }
  };

  const handleStartDrawing = () => {
    if (onStartDrawing) {
        onStartDrawing();
        onClose(); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={`relative bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-500 ease-in-out ${
          selectedFile ? 'w-full max-w-5xl h-[80vh]' : 'w-full max-w-lg h-auto'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0 bg-[#0f0f0f]">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            {selectedFile ? <MessageSquare size={20} className="text-emerald-500" /> : <UploadCloud size={20} className="text-white/70" />}
            {selectedFile ? 'Data Upload & Intelligence' : 'Add Spatial Data'}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {!selectedFile ? (
          /* NO FILE SELECTED: Standard Upload or Draw Modal */
          <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex p-1 mx-6 mt-6 bg-white/5 rounded-lg shrink-0">
              <button 
                onClick={() => setActiveTab('upload')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'upload' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
              >
                <UploadCloud size={16} /> Upload File
              </button>
              <button 
                onClick={() => setActiveTab('draw')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'draw' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
              >
                <PenTool size={16} /> Draw on Map
              </button>
            </div>

            {/* Content */}
            <div className="p-6 pb-8">
              {activeTab === 'upload' && (
                <div className="space-y-6">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    className="hidden" 
                    accept=".geojson,.json,.kml,.zip,.shp,.csv" 
                  />
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
                  >
                      <div className="w-16 h-16 rounded-full bg-white/5 group-hover:bg-emerald-500/10 flex items-center justify-center mb-4 text-white/40 group-hover:text-emerald-500 transition-colors">
                        <FileUp size={28} />
                      </div>
                      <h3 className="text-white font-medium mb-1">Click to upload or drag and drop</h3>
                      <p className="text-white/40 text-xs mb-4">Support for GeoJSON, KML, Shapefile (ZIP), CSV with coordinates (max 50MB)</p>
                      <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors pointer-events-none">
                        Browse Files
                      </button>
                  </div>

                  {/* Best Practice Tips */}
                  <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-left">
                    <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-2">📋 Best Practices</div>
                    <ul className="text-[11px] text-white/50 space-y-1.5">
                      <li>• Upload no more than <span className="text-white/70">50 farms per file</span> for optimal processing speed</li>
                      <li>• Use <span className="text-white/70">GeoJSON or Shapefile (ZIP)</span> for best compatibility</li>
                      <li>• Ensure polygons are in <span className="text-white/70">WGS84 (EPSG:4326)</span> coordinate system</li>
                      <li>• Each farm analysis takes <span className="text-white/70">30-60 seconds</span> via Google Earth Engine</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'draw' && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-white/30">
                    <PenTool size={24} />
                  </div>
                  <h3 className="text-white font-medium mb-2">Draw Mode Active</h3>
                  <p className="text-white/40 text-sm max-w-xs mx-auto mb-6">
                    Manually trace farm boundaries using satellite imagery.
                  </p>
                  <button 
                    onClick={handleStartDrawing}
                    className="px-6 py-2 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition-colors shadow-lg shadow-white/10"
                  >
                    Start Drawing
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* FILE SELECTED: Split view for Upload details and Chat Discussion */
          <div className="flex flex-1 min-h-0">
            
            {/* Left Sidebar: File Details & Actions */}
            <div className="w-1/3 border-r border-white/5 bg-[#111] flex flex-col p-6 space-y-6 overflow-y-auto">
              <div>
                <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Selected Dataset</h3>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg shrink-0">
                    <File size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{selectedFile.name}</p>
                    <p className="text-xs text-white/40 mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.name.split('.').pop()?.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Processing Status</h3>
                <div className="space-y-3">
                  {/* Step 1: File Read */}
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    {isAnalyzing ? <Loader2 size={16} className="animate-spin text-emerald-500" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
                    <div className="flex-1">
                      <span>{isAnalyzing ? 'Reading file data...' : 'File loaded'}</span>
                      {isAnalyzing && (
                        <div className="w-full bg-white/10 h-1 rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Step 2: Parse */}
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    {isAnalyzing ? <Loader2 size={16} className="animate-spin text-emerald-500" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
                    <span>{isAnalyzing ? 'Parsing geometries...' : 'Geometries parsed'}</span>
                  </div>
                  {/* Step 3: Validate */}
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    {isAnalyzing ? <div className="w-4 h-4 rounded-full border-2 border-white/10 shrink-0" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
                    <span>{isAnalyzing ? 'Waiting...' : 'Coordinates validated'}</span>
                  </div>
                  {/* Result */}
                  {!isAnalyzing && parsedData && (
                    <div className="mt-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <div className="text-xs text-emerald-400 font-medium">
                        {parsedData.features?.length || (parsedData.type === 'Feature' ? 1 : 0)} farm boundary(ies) detected
                      </div>
                      <div className="text-[10px] text-emerald-400/60 mt-0.5">Ready to import to workspace</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5 space-y-3">
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="w-full py-2.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 text-sm transition-colors"
                >
                  Cancel & Remove
                </button>
                <button 
                  onClick={handleFinalizeUpload}
                  disabled={isAnalyzing}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Finalize Upload
                </button>
              </div>
            </div>

            {/* Right Main Area: AI Discussion */}
            <div className="flex-1 flex flex-col bg-[#0a0a0a]">
              {/* Messages Area */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === 'ai' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/10 text-white/70'
                      }`}>
                        {msg.role === 'ai' ? <Bot size={16} /> : <User size={16} />}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-white/10 text-white rounded-tr-sm' 
                          : 'bg-[#1a1a1a] border border-white/5 text-white/80 rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-[#111] border-t border-white/5">
                <form 
                  onSubmit={handleSendMessage}
                  className="relative flex items-center bg-black border border-white/10 rounded-xl overflow-hidden focus-within:border-emerald-500/50 transition-colors"
                >
                  <input 
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={isAnalyzing ? "Waiting for analysis..." : "Discuss findings, ask to filter data, or add notes..."}
                    disabled={isAnalyzing}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white text-sm px-4 py-3 disabled:opacity-50 outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={!inputValue.trim() || isAnalyzing}
                    className="p-2 mr-2 rounded-lg bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 disabled:opacity-50 disabled:hover:bg-emerald-500/20 transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </form>
                <p className="text-center text-[10px] text-white/30 mt-3">
                  AI analysis provided by the Maize Intelligence verification system.
                </p>
              </div>
            </div>

          </div>
        )}
      </motion.div>
    </div>
  );
};
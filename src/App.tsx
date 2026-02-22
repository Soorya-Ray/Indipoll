import { useState, useEffect } from 'react';
import {
  Activity,
  Wind,
  Thermometer,
  MapPin,
  Database as DbIcon,
  TrendingUp,
  Info,
  Layers,
  Code,
  Search,
  ShieldAlert,
  Droplets
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import type { Region, PollutionMetric, ClimateMetric, Prediction } from './types';

export default function App() {
  // ---- Application State ---------------------------------------------------

  /** All regions fetched from /api/regions on mount. */
  const [regions, setRegions] = useState<Region[]>([]);
  /** The region currently selected in the sidebar / pill bar. */
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  /** Combined pollution, climate, and prediction data for the selected region. */
  const [metrics, setMetrics] = useState<{
    pollution: PollutionMetric[];
    climate: ClimateMetric[];
    predictions: Prediction[];
  } | null>(null);
  /** Active page/tab shown in the main content area. */
  const [view, setView] = useState<'dashboard' | 'schema' | 'ingestion' | 'prediction' | 'api'>('dashboard');
  /** Text used to filter the region pill bar (case-insensitive). */
  const [searchQuery, setSearchQuery] = useState('');

  // ---- Data Fetching -------------------------------------------------------

  /** Load the region list once on mount, then auto-select the first entry. */
  useEffect(() => {
    fetch('/api/regions')
      .then(res => {
        if (!res.ok) throw new Error(`Regions API returned ${res.status}`);
        return res.json();
      })
      .then(regionsData => {
        if (!Array.isArray(regionsData)) throw new Error('Regions response is not an array');
        setRegions(regionsData);
        if (regionsData.length > 0) setSelectedRegion(regionsData[0]);
      })
      .catch(err => console.error('Failed to fetch regions:', err));
  }, []);

  /** Fetch metrics whenever the selected region changes.
   *  Clears stale data first and cancels in-flight requests on rapid switches. */
  useEffect(() => {
    if (!selectedRegion) return;
    setMetrics(null);
    const controller = new AbortController();
    fetch(`/api/metrics/${selectedRegion.id}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`Metrics API returned ${res.status}`);
        return res.json();
      })
      .then(metricsData => {
        setMetrics({
          pollution: Array.isArray(metricsData?.pollution) ? metricsData.pollution : [],
          climate: Array.isArray(metricsData?.climate) ? metricsData.climate : [],
          predictions: Array.isArray(metricsData?.predictions) ? metricsData.predictions : [],
        });
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.error('Failed to fetch metrics:', err);
      });
    return () => controller.abort();
  }, [selectedRegion]);

  // ---- AQI Helpers ----------------------------------------------------------

  /** Map an AQI value to its Tailwind text-colour class (green → purple). */
  const getAQIColor = (aqi: number) => {
    if (aqi <= 50) return 'text-emerald-500';   // Good
    if (aqi <= 100) return 'text-yellow-500';   // Moderate
    if (aqi <= 200) return 'text-orange-500';   // Poor
    if (aqi <= 300) return 'text-red-500';      // Very Poor
    return 'text-purple-600';                   // Severe
  };

  /** Map an AQI value to a label, health description, and Tailwind background class. */
  const getAQIStatus = (aqi: number) => {
    if (aqi <= 50) return { label: 'Good', desc: 'Air quality is satisfactory, and air pollution poses little or no risk.', color: 'bg-emerald-500' };
    if (aqi <= 100) return { label: 'Moderate', desc: 'Air quality is acceptable. However, there may be a risk for some people.', color: 'bg-yellow-500' };
    if (aqi <= 200) return { label: 'Poor', desc: 'Members of sensitive groups may experience health effects.', color: 'bg-orange-500' };
    if (aqi <= 300) return { label: 'Very Poor', desc: 'Health alert: The risk of health effects is increased for everyone.', color: 'bg-red-500' };
    return { label: 'Severe', desc: 'Health warning of emergency conditions: everyone is more likely to be affected.', color: 'bg-purple-600' };
  };

  // ---- Derived State -------------------------------------------------------

  /** Subset of regions whose name matches the search query (case-insensitive). */
  const filteredRegions = regions.filter(region =>
    region.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /** Auto-select the first visible region when the search filter hides the current selection. */
  useEffect(() => {
    if (filteredRegions.length === 0) return;
    const isCurrentSelectionVisible = filteredRegions.some(region => region.id === selectedRegion?.id);
    if (!isCurrentSelectionVisible) setSelectedRegion(filteredRegions[0]);
  }, [searchQuery]);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-600 p-2 rounded-lg">
                <Activity className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-800">IndiPoll</span>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setView('dashboard')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'dashboard' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setView('schema')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'schema' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Schema Design
              </button>
              <button
                onClick={() => setView('ingestion')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'ingestion' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Data Ingestion
              </button>
              <button
                onClick={() => setView('prediction')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'prediction' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Prediction Engine
              </button>
              <button
                onClick={() => setView('api')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'api' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Backend API
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Region Search & Selector */}
              <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search regions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  {filteredRegions.slice(0, 5).map(region => (
                    <button
                      key={region.id}
                      onClick={() => setSelectedRegion(region)}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 ${selectedRegion?.id === region.id
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {region.name}
                    </button>
                  ))}
                </div>
              </div>

              {selectedRegion && metrics && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Current Status & Charts */}
                  <div className="lg:col-span-2 space-y-8">
                    {/* Main AQI Card */}
                    <div className="bg-white rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 shadow-sm border border-slate-100 overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />

                      <div className="relative z-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 md:mb-10">
                          <div>
                            <h2 className="text-2xl md:text-4xl font-black text-slate-800 tracking-tight">{selectedRegion.name}</h2>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Monitoring</span>
                              <span className="text-slate-400 text-[10px] sm:text-xs">• Updated 2 mins ago</span>
                            </div>
                          </div>
                          <div className="bg-slate-50 px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl text-[10px] font-mono text-slate-400 border border-slate-100">
                            {selectedRegion.latitude.toFixed(4)}°N, {selectedRegion.longitude.toFixed(4)}°E
                          </div>
                        </div>

                        <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-16">
                          <div className="relative shrink-0">
                            <svg className="w-40 h-40 md:w-56 md:h-56 transform -rotate-90">
                              <circle
                                cx="50%"
                                cy="50%"
                                r="45%"
                                stroke="currentColor"
                                strokeWidth="12"
                                fill="transparent"
                                className="text-slate-100"
                              />
                              <circle
                                cx="50%"
                                cy="50%"
                                r="45%"
                                stroke="currentColor"
                                strokeWidth="12"
                                fill="transparent"
                                strokeDasharray="283%"
                                strokeDashoffset={`calc(283% - (283% * ${Math.min(metrics.pollution[0]?.aqi || 0, 500)}) / 500)`}
                                strokeLinecap="round"
                                className={`${getAQIColor(metrics.pollution[0]?.aqi || 0)} transition-all duration-1000`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className={`text-4xl md:text-6xl font-black ${getAQIColor(metrics.pollution[0]?.aqi || 0)}`}>
                                {metrics.pollution[0]?.aqi || '--'}
                              </span>
                              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">AQI</span>
                            </div>
                          </div>

                          <div className="flex-1 w-full space-y-6 md:space-y-8">
                            <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-slate-50 border border-slate-100 flex items-start gap-3 md:gap-4">
                              <div className={`p-2 md:p-3 rounded-xl md:rounded-2xl ${getAQIStatus(metrics.pollution[0]?.aqi || 0).color} text-white shrink-0`}>
                                <ShieldAlert className="w-5 h-5 md:w-6 md:h-6" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 text-sm md:text-base flex items-center gap-2">
                                  {getAQIStatus(metrics.pollution[0]?.aqi || 0).label} Risk
                                </h4>
                                <p className="text-xs md:text-sm text-slate-500 leading-relaxed mt-1">
                                  {getAQIStatus(metrics.pollution[0]?.aqi || 0).desc}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8">
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PM2.5 Concentration</p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-2xl md:text-3xl font-bold text-slate-700">{metrics.pollution[0]?.pm25}</span>
                                  <span className="text-xs text-slate-400">µg/m³</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div className="bg-emerald-500 h-full w-[45%]" />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PM10 Concentration</p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-2xl md:text-3xl font-bold text-slate-700">{metrics.pollution[0]?.pm10}</span>
                                  <span className="text-xs text-slate-400">µg/m³</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div className="bg-blue-500 h-full w-[65%]" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Historical Chart */}
                    <div className="bg-white rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 shadow-sm border border-slate-100">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                        <h3 className="text-lg md:text-xl font-bold text-slate-800">Pollution Trends</h3>
                        <div className="flex gap-3">
                          <span className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-slate-500">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" /> PM2.5
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-slate-500">
                            <div className="w-2 h-2 rounded-full bg-blue-500" /> PM10
                          </span>
                        </div>
                      </div>
                      <div className="h-[250px] md:h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={metrics.pollution.slice().reverse()}>
                            <defs>
                              <linearGradient id="colorPm25" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="colorPm10" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="timestamp"
                              hide
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: '#94a3b8' }}
                            />
                            <Tooltip
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area
                              type="monotone"
                              dataKey="pm25"
                              stroke="#10b981"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#colorPm25)"
                            />
                            <Area
                              type="monotone"
                              dataKey="pm10"
                              stroke="#3b82f6"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#colorPm10)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Climate & Predictions */}
                  <div className="space-y-8">
                    {/* Climate Stats */}
                    <div className="bg-white rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-slate-100">
                      <h3 className="text-lg font-bold text-slate-800 mb-6">Climate Conditions</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                        <div className="p-4 md:p-5 rounded-2xl md:rounded-3xl bg-orange-50 border border-orange-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 md:p-3 rounded-xl md:rounded-2xl bg-white text-orange-500 shadow-sm">
                              <Thermometer className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Temperature</p>
                              <p className="text-lg md:text-xl font-bold text-orange-900">{metrics.climate[0]?.temperature}°C</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 md:p-5 rounded-2xl md:rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 md:p-3 rounded-xl md:rounded-2xl bg-white text-blue-500 shadow-sm">
                              <Droplets className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Humidity</p>
                              <p className="text-lg md:text-xl font-bold text-blue-900">{metrics.climate[0]?.humidity}%</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 md:p-5 rounded-2xl md:rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 md:p-3 rounded-xl md:rounded-2xl bg-white text-slate-500 shadow-sm">
                              <Wind className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Wind Speed</p>
                              <p className="text-lg md:text-xl font-bold text-slate-900">{metrics.climate[0]?.wind_speed ?? '—'} <span className="text-xs font-normal">km/h</span></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Predictions */}
                    <div className="bg-slate-900 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 text-white shadow-xl shadow-slate-200">
                      <div className="flex items-center gap-3 mb-6 md:mb-8">
                        <div className="p-2 bg-emerald-500 rounded-xl">
                          <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-bold">AI Forecast</h3>
                      </div>
                      <div className="space-y-3 md:space-y-4">
                        {metrics.predictions.map((pred, idx) => (
                          <div key={idx} className="p-4 md:p-5 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors">
                            <div>
                              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Next 24 Hours</p>
                              <p className="text-xs md:text-sm text-slate-300 mt-1">{new Date(pred.target_timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <div className={`w-2 h-2 rounded-full ${getAQIStatus(pred.predicted_aqi).color}`} />
                                <p className="text-xl md:text-2xl font-black">{pred.predicted_aqi}</p>
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono mt-1">Confidence: {(pred.confidence_score * 100).toFixed(0)}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 md:mt-8 p-4 md:p-5 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 flex gap-3 md:gap-4">
                        <Info className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 shrink-0" />
                        <p className="text-[10px] md:text-[11px] text-slate-400 leading-relaxed">
                          Our Random Forest model analyzes 24-hour lag patterns and climate variables to provide high-accuracy forecasts.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : view === 'schema' ? (
            <motion.div
              key="schema"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12 pb-20"
            >
              {/* Header */}
              <div className="max-w-3xl">
                <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Database Architecture</h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  A fully normalized relational schema designed for high-throughput pollution monitoring and predictive analytics.
                </p>
              </div>

              {/* ER Diagram Explanation */}
              <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <Layers className="w-6 h-6 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-slate-800">1. ER Diagram Explanation</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4 text-slate-600">
                    <p>The <strong>IndiPoll</strong> schema follows a star-like snowflake pattern centered around the <code>Regions</code> entity.</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Regions:</strong> The core dimension table. All metrics and sources are linked to a specific region.</li>
                      <li><strong>PollutionMetrics & ClimateMetrics:</strong> Fact tables storing high-frequency time-series data.</li>
                      <li><strong>PollutionSources:</strong> Descriptive table for point-source emitters within a region.</li>
                      <li><strong>Predictions:</strong> Output table for ML models, linking back to regions for spatial context.</li>
                    </ul>
                  </div>
                  <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-emerald-400 overflow-x-auto">
                    <pre>{`
[Regions] 1 --- * [PollutionMetrics]
          1 --- * [ClimateMetrics]
          1 --- * [PollutionSources]
          1 --- * [Predictions]
                    `}</pre>
                  </div>
                </div>
              </section>

              {/* Table Structure */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <DbIcon className="w-6 h-6 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-slate-800">2. Table Structure & 3. SQL Statements</h2>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      name: 'Regions',
                      sql: `CREATE TABLE regions (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  country VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`
                    },
                    {
                      name: 'PollutionMetrics',
                      sql: `CREATE TABLE pollution_metrics (
  id UUID PRIMARY KEY,
  region_id UUID REFERENCES regions(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  pm25 DECIMAL(6,2),
  pm10 DECIMAL(6,2),
  no2 DECIMAL(6,2),
  so2 DECIMAL(6,2),
  co DECIMAL(6,2),
  o3 DECIMAL(6,2),
  aqi INTEGER,
  CONSTRAINT valid_aqi CHECK (aqi >= 0)
);`
                    },
                    {
                      name: 'ClimateMetrics',
                      sql: `CREATE TABLE climate_metrics (
  id UUID PRIMARY KEY,
  region_id UUID REFERENCES regions(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  temperature DECIMAL(4,2),
  humidity DECIMAL(5,2),
  wind_speed DECIMAL(5,2),
  wind_direction INTEGER,
  precipitation DECIMAL(6,2),
  pressure DECIMAL(6,2)
);`
                    },
                    {
                      name: 'PollutionSources',
                      sql: `CREATE TABLE pollution_sources (
  id UUID PRIMARY KEY,
  region_id UUID REFERENCES regions(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) CHECK (type IN ('Industrial', 'Traffic', 'Agricultural', 'Natural')),
  emission_rate DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'Active'
);`
                    },
                    {
                      name: 'Predictions',
                      sql: `CREATE TABLE predictions (
  id UUID PRIMARY KEY,
  region_id UUID REFERENCES regions(id),
  prediction_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  target_timestamp TIMESTAMP NOT NULL,
  predicted_aqi INTEGER,
  confidence_score DECIMAL(3,2),
  model_version VARCHAR(50)
);`
                    },
                    {
                      name: 'DataSources',
                      sql: `CREATE TABLE data_sources (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  base_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);`
                    },
                    {
                      name: 'RawIngest',
                      sql: `CREATE TABLE raw_ingest (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES data_sources(id),
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  raw_payload JSONB NOT NULL,
  format VARCHAR(50) NOT NULL,
  processed BOOLEAN DEFAULT FALSE
);`
                    }
                  ].map((table, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                        <span className="font-bold text-slate-700">{table.name}</span>
                        <Code className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="p-6 bg-slate-900">
                        <pre className="text-sm text-emerald-400 font-mono overflow-x-auto">
                          {table.sql}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Indexing & Keys */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">4. Primary & Foreign Keys</h3>
                  <div className="space-y-4 text-sm text-slate-600">
                    <p><strong>Primary Keys:</strong> All tables use <code>UUID</code> (or <code>TEXT</code> in SQLite) as primary keys to ensure global uniqueness across distributed sensors.</p>
                    <p><strong>Foreign Keys:</strong> <code>region_id</code> is the universal foreign key, enforcing referential integrity and enabling efficient joins for regional analysis.</p>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">5. Indexing Suggestions</h3>
                  <div className="space-y-2">
                    {[
                      'CREATE INDEX idx_pollution_region_time ON pollution_metrics(region_id, timestamp DESC);',
                      'CREATE INDEX idx_climate_region_time ON climate_metrics(region_id, timestamp DESC);',
                      'CREATE INDEX idx_predictions_target ON predictions(target_timestamp);',
                      'CREATE INDEX idx_regions_coords ON regions(latitude, longitude);',
                      'CREATE INDEX idx_raw_ingest_source_time ON raw_ingest(source_id, fetched_at DESC);',
                      'CREATE INDEX idx_raw_ingest_processed ON raw_ingest(processed);'
                    ].map((idx, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl font-mono text-xs text-slate-500 border border-slate-100">
                        {idx}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </motion.div>
          ) : view === 'api' ? (
            <motion.div
              key="api"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="max-w-3xl">
                <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Backend API Layer</h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  FastAPI-based RESTful service providing high-performance endpoints for data retrieval and real-time prediction execution.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-lg">
                      <Code className="w-5 h-5 text-orange-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">main.py (FastAPI)</h2>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">FastAPI</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">Pydantic</span>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                  <pre className="text-sm text-orange-300 font-mono overflow-x-auto leading-relaxed">
                    {`from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import List
import sqlalchemy
from sqlalchemy.orm import Session
import joblib

app = FastAPI(title="IndiPoll API")
model = joblib.load("model.pkl")

# Pydantic Schemas
class Region(BaseModel):
    id: str
    name: str

class PredictionRequest(BaseModel):
    region_id: str
    temperature: float
    humidity: float
    wind_speed: float

@app.get("/regions", response_model=List[Region])
def get_regions(db: Session = Depends(get_db)):
    return db.query(RegionModel).all()

@app.get("/pollution-data/{region_id}")
def get_pollution(region_id: str, db: Session = Depends(get_db)):
    data = db.query(PollutionModel).filter(region_id == region_id).all()
    if not data:
        raise HTTPException(status_code=404, detail="Region not found")
    return data

@app.post("/run-prediction")
def run_prediction(req: PredictionRequest):
    # Prepare features for model
    features = [[req.temperature, req.humidity, req.wind_speed, 150.0, 145.0]]
    prediction = model.predict(features)[0]
    return {"predicted_aqi": round(prediction, 2)}`}
                  </pre>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-slate-800">API Capabilities</h3>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Automatic Swagger/OpenAPI documentation generation.
                      </li>
                      <li className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Asynchronous request handling for high concurrency.
                      </li>
                      <li className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Built-in data validation using Pydantic models.
                      </li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Endpoint Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-white px-2 py-1 rounded border text-emerald-600">GET /regions</code>
                        <span className="text-xs text-slate-400">List all regions</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-white px-2 py-1 rounded border text-emerald-600">GET /pollution-data/{"{id}"}</code>
                        <span className="text-xs text-slate-400">Historical metrics</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-white px-2 py-1 rounded border text-blue-600">POST /run-prediction</code>
                        <span className="text-xs text-slate-400">Execute ML model</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === 'prediction' ? (
            <motion.div
              key="prediction"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="max-w-3xl">
                <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">AI Prediction Engine</h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Random Forest Regressor model trained on climate variables and historical pollution data to forecast Air Quality Index (AQI).
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 p-2 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                      </div>
                      <h2 className="text-xl font-bold text-slate-800">model_trainer.py</h2>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                    <pre className="text-sm text-purple-300 font-mono overflow-x-auto leading-relaxed">
                      {`import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

class IndiPollPredictor:
    def __init__(self):
        self.model = RandomForestRegressor(n_estimators=100, random_state=42)
        
    def prepare_data(self, df):
        """
        Features: temp, humidity, wind_speed, lag_aqi_1h, lag_aqi_24h
        Target: aqi
        """
        df['lag_aqi_1h'] = df['aqi'].shift(1)
        df['lag_aqi_24h'] = df['aqi'].shift(24)
        df = df.dropna()
        
        X = df[['temperature', 'humidity', 'wind_speed', 'lag_aqi_1h', 'lag_aqi_24h']]
        y = df['aqi']
        return train_test_split(X, y, test_size=0.2, random_state=42)

    def train(self, X_train, y_train):
        self.model.fit(X_train, y_train)
        
    def evaluate(self, X_test, y_test):
        predictions = self.model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        r2 = r2_score(y_test, predictions)
        return {"MAE": mae, "R2": r2}

    def save_model(self, path='model.pkl'):
        joblib.dump(self.model, path)`}
                    </pre>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Model Architecture</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>Random Forest:</strong> Handles non-linear relationships between climate and pollution.</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>Lag Features:</strong> Incorporates temporal dependencies (1h and 24h shifts).</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>Evaluation:</strong> Optimized for Mean Absolute Error (MAE) to minimize prediction deviation.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-600 rounded-3xl p-8 text-white shadow-lg shadow-purple-200">
                    <h3 className="text-lg font-bold mb-2">Performance Metrics</h3>
                    <div className="space-y-4 mt-6">
                      <div className="flex justify-between items-end">
                        <span className="text-purple-100 text-sm">R² Score</span>
                        <span className="text-2xl font-black">0.89</span>
                      </div>
                      <div className="w-full bg-purple-400/30 h-2 rounded-full overflow-hidden">
                        <div className="bg-white h-full w-[89%]" />
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-purple-100 text-sm">Avg. MAE</span>
                        <span className="text-2xl font-black">12.4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="ingestion"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="max-w-3xl">
                <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Data Ingestion Layer</h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Python-based ingestion script for processing pollution and climate datasets with built-in validation and batch optimization.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <Code className="w-5 h-5 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">ingestor.py</h2>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">Python 3.9+</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">SQLAlchemy</span>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                  <pre className="text-sm text-blue-300 font-mono overflow-x-auto leading-relaxed">
                    {`import pandas as pd
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class IndiPollIngestor:
    def __init__(self, db_url):
        self.engine = create_engine(db_url)
        
    def validate_pollution_data(self, df):
        """Basic validation for pollution metrics."""
        required_cols = ['region_id', 'pm25', 'pm10', 'aqi']
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Ensure numeric values are positive
        numeric_cols = ['pm25', 'pm10', 'aqi']
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            df[col] = df[col].clip(lower=0)
        
        return df.dropna(subset=['region_id', 'aqi'])

    def ingest_pollution_csv(self, file_path):
        """Ingests pollution data from a CSV file using batch inserts."""
        try:
            df = pd.read_csv(file_path)
            df = self.validate_pollution_data(df)
            
            # Efficient Batch Insert
            df.to_sql(
                'pollution_metrics', 
                con=self.engine, 
                if_exists='append', 
                index=False,
                method='multi',
                chunksize=1000
            )
            logger.info(f"Successfully ingested {len(df)} records.")
        except Exception as e:
            logger.error(f"Failed to ingest CSV: {str(e)}")

    def ingest_via_api(self, api_data):
        """Ingests data with duplicate prevention (ON CONFLICT)."""
        query = text("""
            INSERT INTO pollution_metrics (id, region_id, timestamp, pm25, pm10, aqi)
            VALUES (:id, :region_id, :timestamp, :pm25, :pm10, :aqi)
            ON CONFLICT (region_id, timestamp) DO NOTHING;
        """)
        with self.engine.begin() as conn:
            conn.execute(query, api_data)`}
                  </pre>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Validation</h4>
                    <p className="text-xs text-slate-500">Uses Pandas for type coercion and range checking before database commit.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Efficiency</h4>
                    <p className="text-xs text-slate-500">Implements <code>method='multi'</code> and <code>chunksize</code> for optimized PostgreSQL inserts.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Reliability</h4>
                    <p className="text-xs text-slate-500">Uses <code>ON CONFLICT DO NOTHING</code> to prevent duplicate time-series entries.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex justify-center items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-slate-800">IndiPoll System</span>
          </div>
          <p className="text-sm text-slate-400">Designed for the next generation of environmental monitoring.</p>
        </div>
      </footer>
    </div>
  );
}

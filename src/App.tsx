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
                  A normalised relational schema implemented in SQLite, storing multivariate environmental time-series data, seeded prediction forecasts, and structural provisions for future ML explainability.
                </p>
              </div>

              {/* ER Diagram Explanation */}
              <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <Layers className="w-6 h-6 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-slate-800">1. Entity-Relationship Model</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4 text-slate-600">
                    <p>The schema employs a star-like topology with <code>regions</code> as the central dimension table, persisted in a single SQLite file (<code>indipoll.db</code>).</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>regions:</strong> Primary dimension entity. Every dependent relation references a region through the <code>region_id</code> foreign key.</li>
                      <li><strong>pollution_metrics & climate_metrics:</strong> Time-series fact tables recording hourly pollutant concentrations and meteorological observations, respectively.</li>
                      <li><strong>pollution_sources:</strong> Categorical registry of emission sources, constrained to four typologies (Industrial, Traffic, Agricultural, Natural).</li>
                      <li><strong>predictions:</strong> Stores region-specific AQI forecasts with confidence scores and model version labels. Currently populated by deterministic seed data in <code>server.ts</code>.</li>
                      <li><strong>model_explanations:</strong> Provisioned for per-prediction SHAP feature contributions. Table is defined but currently empty; will be populated when <code>ml_train.py</code> is executed.</li>
                      <li><strong>data_sources & raw_ingest:</strong> Provisioned for external API data provenance. Tables are defined but unused at runtime; the application currently relies on in-process seed data.</li>
                    </ul>
                  </div>
                  <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-emerald-400 overflow-x-auto">
                    <pre>{`
[regions] 1 ──* [pollution_metrics]
          1 ──* [climate_metrics]
          1 ──* [pollution_sources]
          1 ──* [predictions] 1 ──* [model_explanations]
[data_sources] 1 ──* [raw_ingest]
                    `}</pre>
                  </div>
                </div>
              </section>

              {/* Table Structure */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <DbIcon className="w-6 h-6 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-slate-800">2. Table Definitions & DDL Statements</h2>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      name: 'regions',
                      sql: `CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL
);`
                    },
                    {
                      name: 'pollution_metrics',
                      sql: `CREATE TABLE IF NOT EXISTS pollution_metrics (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  pm25 REAL,
  pm10 REAL,
  no2 REAL,
  so2 REAL,
  co REAL,
  o3 REAL,
  aqi INTEGER,
  FOREIGN KEY (region_id) REFERENCES regions(id)
);`
                    },
                    {
                      name: 'climate_metrics',
                      sql: `CREATE TABLE IF NOT EXISTS climate_metrics (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  temperature REAL,
  humidity REAL,
  wind_speed REAL,
  wind_direction REAL,
  precipitation REAL,
  pressure REAL,
  FOREIGN KEY (region_id) REFERENCES regions(id)
);`
                    },
                    {
                      name: 'pollution_sources',
                      sql: `CREATE TABLE IF NOT EXISTS pollution_sources (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN
    ('Industrial','Traffic','Agricultural','Natural')),
  emission_rate REAL,
  status TEXT CHECK(status IN ('Active','Inactive')),
  FOREIGN KEY (region_id) REFERENCES regions(id)
);`
                    },
                    {
                      name: 'predictions',
                      sql: `CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL,
  prediction_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  target_timestamp DATETIME NOT NULL,
  predicted_aqi INTEGER,
  confidence_score REAL,
  model_version TEXT,
  FOREIGN KEY (region_id) REFERENCES regions(id)
);`
                    },
                    {
                      name: 'model_explanations',
                      sql: `CREATE TABLE IF NOT EXISTS model_explanations (
  id TEXT PRIMARY KEY,
  prediction_id TEXT REFERENCES predictions(id),
  feature_name TEXT,
  feature_value REAL,
  contribution REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`
                    },
                    {
                      name: 'data_sources',
                      sql: `CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`
                    },
                    {
                      name: 'raw_ingest',
                      sql: `CREATE TABLE IF NOT EXISTS raw_ingest (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  source_url TEXT NOT NULL,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  raw_payload TEXT NOT NULL,
  format TEXT NOT NULL,
  processed INTEGER DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES data_sources(id)
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
                  <h3 className="text-xl font-bold text-slate-800 mb-4">4. Key Constraints & Referential Integrity</h3>
                  <div className="space-y-4 text-sm text-slate-600">
                    <p><strong>Primary Keys:</strong> Every table employs a <code>TEXT</code> primary key containing a UUID-formatted string, ensuring uniqueness across seed entries and future ingestion batches.</p>
                    <p><strong>Foreign Keys:</strong> <code>region_id</code> serves as the universal referential constraint, linking metrics, sources, and predictions back to <code>regions</code>. A secondary foreign key in <code>model_explanations</code> references <code>predictions(id)</code>, establishing a one-to-many relationship for future per-prediction explanations.</p>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">5. Recommended Index Strategy</h3>
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
                  A stateless RESTful service built on Express.js and better-sqlite3. Two endpoints actively serve data (regions and metrics); a third is defined for future SHAP explanations but currently returns no results.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-lg">
                      <Code className="w-5 h-5 text-orange-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">server.ts (Express)</h2>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">Express.js</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">better-sqlite3</span>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                  <pre className="text-sm text-orange-300 font-mono overflow-x-auto leading-relaxed">
                    {`import express from "express";
import Database from "better-sqlite3";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const db = new Database("indipoll.db");

// Schema initialised via db.exec(\`CREATE TABLE IF NOT EXISTS …\`)
// Seed data inserted idempotently with INSERT OR IGNORE

/** GET /api/regions — List all monitored regions. */
app.get("/api/regions", (_req, res) => {
  const allRegions = db.prepare("SELECT * FROM regions").all();
  res.json(allRegions);
});

/** GET /api/metrics/:regionId — Pollution, climate & predictions. */
app.get("/api/metrics/:regionId", (req, res) => {
  const { regionId } = req.params;
  const pollution = db.prepare(
    "SELECT * FROM pollution_metrics WHERE region_id = ? ORDER BY timestamp DESC LIMIT 10"
  ).all(regionId);
  const climate = db.prepare(
    "SELECT * FROM climate_metrics WHERE region_id = ? ORDER BY timestamp DESC LIMIT 10"
  ).all(regionId);
  const predictions = db.prepare(
    "SELECT * FROM predictions WHERE region_id = ? ORDER BY target_timestamp ASC LIMIT 5"
  ).all(regionId);
  res.json({ pollution, climate, predictions });
});

/** GET /api/explain/:predictionId — SHAP feature contributions. */
app.get("/api/explain/:predictionId", (req, res) => {
  const contributions = db.prepare(
    "SELECT feature_name, feature_value, contribution FROM model_explanations WHERE prediction_id = ? ORDER BY ABS(contribution) DESC"
  ).all(req.params.predictionId);
  res.json({ prediction_id: req.params.predictionId, contributions });
});`}
                  </pre>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-slate-800">Architectural Characteristics</h3>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Dual-mode serving: embedded Vite middleware for hot-module replacement in development; optimised static asset delivery in production.
                      </li>
                      <li className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Self-initialising SQLite database with idempotent seed data (INSERT OR IGNORE), requiring zero external provisioning.
                      </li>
                      <li className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Clean namespace separation: all data endpoints scoped under <code>/api/</code>; SPA catch-all for client-side routing.
                      </li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Endpoint Reference</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-white px-2 py-1 rounded border text-emerald-600">GET /api/regions</code>
                        <span className="text-xs text-slate-400">Returns all 3 seeded regions</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-white px-2 py-1 rounded border text-emerald-600">GET /api/metrics/{"{"}id{"}"}</code>
                        <span className="text-xs text-slate-400">Pollution, climate & seeded predictions</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-white px-2 py-1 rounded border text-emerald-600">GET /api/explain/{"{"}id{"}"}</code>
                        <span className="text-xs text-slate-400">Defined; returns 404 until model is trained</span>
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
                <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Prediction Training Script</h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  <code>ml_train.py</code> is a standalone training script designed to build a RandomForestRegressor (200 estimators) on joined pollution and climate data, with SHAP-based explainability. It targets a PostgreSQL database and has not yet been executed against the application's SQLite store. The dashboard currently displays deterministic seed predictions generated by <code>server.ts</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 p-2 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                      </div>
                      <h2 className="text-xl font-bold text-slate-800">ml_train.py</h2>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                    <pre className="text-sm text-purple-300 font-mono overflow-x-auto leading-relaxed">
                      {`from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import shap, joblib, numpy as np

# 12 base features joined from pollution_metrics + climate_metrics
BASE_FEATURES = [
    "pm25","pm10","no2","so2","co","o3",
    "temperature","humidity","wind_speed",
    "wind_direction","precipitation","pressure",
]

# Feature engineering: temporal + lag + rolling
df["hour"]        = df["timestamp"].dt.hour
df["day_of_week"] = df["timestamp"].dt.dayofweek
df["month"]       = df["timestamp"].dt.month

for lag in [1, 3, 6]:             # lag features
    df[f"{col}_lag_{lag}"] = df.groupby("region_id")[col].shift(lag)
for window in [3, 6]:             # rolling mean
    df[f"{col}_roll_{window}"] = (
        df.groupby("region_id")[col]
          .rolling(window, min_periods=1).mean()
    )

# Train / evaluate
model = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
model.fit(X_train, y_train)
preds = model.predict(X_test)
rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
mae  = float(mean_absolute_error(y_test, preds))

# SHAP explainability → stored per-prediction in model_explanations
explainer   = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)
joblib.dump(model, "model.pkl")`}
                    </pre>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Script Design (Not Yet Executed)</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>Ensemble Regressor (200 estimators):</strong> Configured to model non-linear dependencies between 12 pollutant and climate covariates and the target AQI.</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>Feature Engineering:</strong> Script generates lag features (k ∈ &#123;1, 3, 6&#125;) and rolling means (w ∈ &#123;3, 6&#125;) per region, plus temporal features (hour, day_of_week, month).</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>SHAP Integration:</strong> Designed to compute TreeExplainer values and persist them in <code>model_explanations</code>. Requires execution against a PostgreSQL database with sufficient training data.</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                        <p className="text-sm text-slate-600"><strong>Current Status:</strong> Not yet run. Requires <code>psycopg</code>, <code>scikit-learn</code>, <code>shap</code>, and <code>joblib</code> Python packages, plus a PostgreSQL connection string.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-600 rounded-3xl p-8 text-white shadow-lg shadow-purple-200">
                    <h3 className="text-lg font-bold mb-2">Planned Evaluation</h3>
                    <div className="space-y-4 mt-6">
                      <div className="flex justify-between items-end">
                        <span className="text-purple-100 text-sm">RMSE</span>
                        <span className="text-lg font-bold text-purple-100">Root Mean Squared Error</span>
                      </div>
                      <div className="w-full bg-purple-400/30 h-2 rounded-full overflow-hidden">
                        <div className="bg-white/20 h-full w-full" />
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-purple-100 text-sm">MAE</span>
                        <span className="text-lg font-bold text-purple-100">Mean Absolute Error</span>
                      </div>
                      <div className="w-full bg-purple-400/30 h-2 rounded-full overflow-hidden">
                        <div className="bg-white/20 h-full w-full" />
                      </div>
                      <p className="text-xs text-purple-200 mt-2">Metrics will be computed on an 80/20 train-test split (random_state=42) once the script is executed. No model has been trained yet.</p>
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
                <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Data Ingestion Scripts</h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Two standalone Python scripts designed for external data integration: <strong>openaq_ingest.py</strong> fetches measurements from the OpenAQ v3 REST API into <code>raw_ingest</code>, and <strong>transform_ingest.py</strong> normalises raw payloads into <code>pollution_metrics</code> and <code>climate_metrics</code>. Both scripts target a PostgreSQL database and are not part of the current application runtime. Data displayed in the dashboard is produced by in-process seed logic in <code>server.ts</code>.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <Code className="w-5 h-5 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">openaq_ingest.py → transform_ingest.py</h2>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">Python 3.9+</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">psycopg</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase">OpenAQ v3</span>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                  <pre className="text-sm text-blue-300 font-mono overflow-x-auto leading-relaxed">
                    {`# ── Stage 1: openaq_ingest.py ─────────────────────────
# Fetches latest measurements from the OpenAQ REST API
# for Indian monitoring stations and stores raw JSON
# payloads in the raw_ingest table.

API_BASE = "https://api.openaq.org"

def _iter_india_locations(api_key, limit, max_pages, ...):
    """Paginate /v3/locations?iso=IN and yield location dicts."""
    page = 1
    while page <= max_pages:
        url = f"{API_BASE}/v3/locations?iso=IN&limit={limit}&page={page}"
        data = _request_with_retries(url, api_key, ...)
        yield from data.get("results") or []
        page += 1

def _insert_raw_ingest(conn, json_adapter, source_id, url, payload, fmt):
    """INSERT INTO raw_ingest (id, source_id, source_url, raw_payload, format)"""
    ...

# ── Stage 2: transform_ingest.py ─────────────────────
# Reads unprocessed rows from raw_ingest, extracts
# pollution (pm25, pm10, no2, so2, co, o3, aqi) and
# climate (temperature, humidity, wind_speed, …) values,
# then inserts normalised rows into pollution_metrics
# and climate_metrics. Marks raw rows as processed.

POLLUTION_PARAMS = {"pm25","pm10","no2","so2","co","o3"}
CLIMATE_PARAMS   = {"temperature","humidity","wind_speed",
                    "wind_direction","precipitation","pressure"}

def _extract_measurements(payload):
    """Parse OpenAQ JSON → (pollution_values, climate_values, ts)"""
    ...

def _insert_pollution(conn, region_id, ts, values):
    """INSERT OR IGNORE INTO pollution_metrics …"""
    ...

def _mark_processed(conn, raw_id):
    """UPDATE raw_ingest SET processed = TRUE WHERE id = …"""
    ...`}
                  </pre>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Fault Tolerance</h4>
                    <p className="text-xs text-slate-500"><code>openaq_ingest.py</code> implements exponential backoff with randomised jitter for resilient API calls against rate limits and transient network failures.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Parameter Normalisation</h4>
                    <p className="text-xs text-slate-500"><code>transform_ingest.py</code> canonicalises heterogeneous parameter names (<code>temp→temperature</code>, <code>ws→wind_speed</code>) via lookup dict, then partitions values into pollutant and climate sets.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Row-Level Processing</h4>
                    <p className="text-xs text-slate-500">Each <code>raw_ingest</code> row is read with <code>FOR UPDATE SKIP LOCKED</code> and marked <code>processed = TRUE</code> after transformation, enabling concurrent batch execution without duplicates.</p>
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

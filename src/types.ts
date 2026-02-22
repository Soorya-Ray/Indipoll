export interface Region {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  timezone: string;
}

export interface PollutionMetric {
  id: string;
  region_id: string;
  timestamp: string;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  aqi: number;
}

export interface ClimateMetric {
  id: string;
  region_id: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction: number;
  precipitation: number;
  pressure: number;
}

export interface PollutionSource {
  id: string;
  region_id: string;
  name: string;
  type: 'Industrial' | 'Traffic' | 'Agricultural' | 'Natural';
  emission_rate: number;
  status: 'Active' | 'Inactive';
}

export interface Prediction {
  id: string;
  region_id: string;
  prediction_timestamp: string;
  target_timestamp: string;
  predicted_aqi: number;
  confidence_score: number;
  model_version: string;
}

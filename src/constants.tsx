export const ingestionPythonCode = `
import pandas as pd
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
        """
        Basic validation for pollution metrics.
        """
        # Check for required columns
        required_cols = ['region_id', 'pm25', 'pm10', 'aqi']
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Ensure numeric values are positive
        numeric_cols = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3', 'aqi']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                if (df[col] < 0).any():
                    logger.warning(f"Negative values found in {col}. Clipping to 0.")
                    df[col] = df[col].clip(lower=0)
        
        # Drop rows with missing critical data
        df = df.dropna(subset=['region_id', 'aqi'])
        return df

    def ingest_pollution_csv(self, file_path):
        """
        Ingests pollution data from a CSV file using batch inserts.
        """
        try:
            df = pd.read_csv(file_path)
            df = self.validate_pollution_data(df)
            
            # Add UUIDs and Timestamps if missing
            if 'id' not in df.columns:
                df['id'] = [str(uuid.uuid4()) for _ in range(len(df))]
            if 'timestamp' not in df.columns:
                df['timestamp'] = datetime.now()

            # Efficient Batch Insert using SQLAlchemy
            # We use 'multi' method for better performance on PostgreSQL
            df.to_sql(
                'pollution_metrics', 
                con=self.engine, 
                if_exists='append', 
                index=False,
                method='multi',
                chunksize=1000
            )
            
            logger.info(f"Successfully ingested {len(df)} records into pollution_metrics.")
            
        except Exception as e:
            logger.error(f"Failed to ingest CSV: {str(e)}")
            raise

    def ingest_via_api(self, api_data):
        """
        Ingests data from a dictionary (e.g., from an API response).
        Includes duplicate prevention logic.
        """
        query = text("""
            INSERT INTO pollution_metrics (id, region_id, timestamp, pm25, pm10, aqi)
            VALUES (:id, :region_id, :timestamp, :pm25, :pm10, :aqi)
            ON CONFLICT (region_id, timestamp) DO NOTHING;
        """)
        
        try:
            with self.engine.begin() as conn:
                # Assuming api_data is a list of dicts
                conn.execute(query, api_data)
            logger.info("API data ingestion complete (duplicates skipped).")
        except SQLAlchemyError as e:
            logger.error(f"Database error during API ingestion: {str(e)}")

# Example Usage
if __name__ == "__main__":
    DB_URL = "postgresql://user:password@localhost:5432/indipoll"
    ingestor = IndiPollIngestor(DB_URL)
    
    # ingestor.ingest_pollution_csv('daily_metrics.csv')
`;

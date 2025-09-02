import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '../types';

const API_URL = 'https://api.kexpdoubleplays.org';

export const useDoublePlayData = () => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/api/double-plays`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching double play data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Background refresh capability for future YouTube integration
  const startBackgroundRefresh = useCallback((intervalMs: number = 60000) => {
    const interval = setInterval(() => {
      // Only refresh if not currently loading to avoid conflicts
      if (!loading) {
        fetchData();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [fetchData, loading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdate,
    refetch: fetchData,
    startBackgroundRefresh
  };
};
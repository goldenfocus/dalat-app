'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeolocationState, UserLocation } from '@/lib/types';

const DALAT_DEFAULT = { lat: 11.9404, lng: 108.4583 };
const LOCATION_CACHE_KEY = 'dalat_user_location';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 2;

export function useGeolocation(autoRequest = false) {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    loading: false,
    error: null,
    permissionState: null,
  });
  const retryCountRef = useRef(0);

  // Check cached location on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cached = localStorage.getItem(LOCATION_CACHE_KEY);
    if (cached) {
      try {
        const loc: UserLocation = JSON.parse(cached);
        if (Date.now() - loc.timestamp < CACHE_DURATION_MS) {
          setState(prev => ({ ...prev, location: loc }));
          return;
        }
      } catch {}
    }

    if (autoRequest) {
      requestLocation();
    }
  }, [autoRequest]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation not supported',
        loading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        };

        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));

        setState({
          location,
          loading: false,
          error: null,
          permissionState: 'granted',
        });
      },
      (error) => {
        let errorMsg = 'Unable to get location';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Location permission denied';
          setState(prev => ({ ...prev, permissionState: 'denied' }));
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Location request timed out';
        }

        setState(prev => ({
          ...prev,
          error: errorMsg,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: CACHE_DURATION_MS,
      }
    );
  }, []);

  const clearLocation = useCallback(() => {
    localStorage.removeItem(LOCATION_CACHE_KEY);
    setState({
      location: null,
      loading: false,
      error: null,
      permissionState: null,
    });
  }, []);

  return {
    ...state,
    requestLocation,
    clearLocation,
    hasLocation: state.location !== null,
  };
}

'use client';

import { useState, useEffect, useCallback } from 'react';

type Platform = 'ios' | 'android' | 'desktop' | 'unknown';
type InstallState = 'prompt' | 'installed' | 'dismissed' | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UseInstallPromptReturn {
  installState: InstallState;
  platform: Platform;
  canPrompt: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<boolean>;
  dismissPrompt: () => void;
  showInstructions: boolean;
  setShowInstructions: (show: boolean) => void;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_DAYS = 7;

function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);

  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://');
}

function isDismissed(): boolean {
  if (typeof window === 'undefined') return false;

  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;

  const dismissedAt = parseInt(dismissed, 10);
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);

  return daysSince < DISMISS_DURATION_DAYS;
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Initialize as 'installed' if already in standalone mode to prevent banner flash
  const [installState, setInstallState] = useState<InstallState>(() => {
    if (typeof window !== 'undefined' && isStandaloneMode()) {
      return 'installed';
    }
    return 'unsupported';
  });
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window !== 'undefined') {
      return isStandaloneMode();
    }
    return false;
  });
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const detectedPlatform = getPlatform();
    setPlatform(detectedPlatform);

    // Check standalone mode - if already in PWA, don't show install prompt
    const checkStandalone = () => {
      const standalone = isStandaloneMode();
      setIsStandalone(standalone);
      return standalone;
    };

    if (checkStandalone()) {
      setInstallState('installed');
      return;
    }

    if (isDismissed()) {
      setInstallState('dismissed');
      return;
    }

    // iOS doesn't support beforeinstallprompt but can still be installed
    if (detectedPlatform === 'ios') {
      setInstallState('prompt');
      return;
    }

    // Listen for the beforeinstallprompt event (Chrome, Edge, etc.)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallState('prompt');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app was installed
    const handleAppInstalled = () => {
      setInstallState('installed');
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Listen for display-mode changes (detects when user installs PWA)
    const displayModeMediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsStandalone(true);
        setInstallState('installed');
      }
    };
    displayModeMediaQuery.addEventListener('change', handleDisplayModeChange);

    // If no prompt event fires within 3 seconds, still show the banner
    // (allows manual install instructions for all platforms)
    const timeout = setTimeout(() => {
      // Re-check standalone in case it changed during the timeout
      if (checkStandalone()) {
        setInstallState('installed');
        return;
      }
      if (!deferredPrompt) {
        // No native prompt available, but we can still show manual instructions
        setInstallState('prompt');
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      displayModeMediaQuery.removeEventListener('change', handleDisplayModeChange);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run only once on mount
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      // No native prompt available, show instructions modal instead
      setShowInstructions(true);
      return false;
    }

    try {
      const result = await deferredPrompt.prompt();

      if (result.outcome === 'accepted') {
        setInstallState('installed');
        setDeferredPrompt(null);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Install prompt error:', error);
      return false;
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setInstallState('dismissed');
  }, []);

  return {
    installState,
    platform,
    canPrompt: !!deferredPrompt,
    isStandalone,
    promptInstall,
    dismissPrompt,
    showInstructions,
    setShowInstructions,
  };
}

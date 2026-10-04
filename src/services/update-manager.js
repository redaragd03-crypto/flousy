/* update-manager.js — GitHub in-app update system for FLOUSY */

/**
 * Update Manager for FLOUSY Android App
 * 
 * Handles:
 * - Fetching version.json from GitHub Pages
 * - Comparing current vs latest versionCode
 * - Determining update availability (optional/mandatory)
 * - Opening APK download URL
 * - Offline handling
 * - Invalid version.json handling
 */

const VERSION_JSON_URL = 'https://redaragd03-crypto.github.io/flousy/version.json';
const CURRENT_VERSION_CODE = 1; // Synced with android/app/build.gradle
const CURRENT_VERSION_NAME = '1.0';

/**
 * Fetch version.json with timeout and error handling
 * @returns {Promise<Object|null>} Parsed version data or null on error
 */
export async function fetchVersionInfo() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(VERSION_JSON_URL, {
      signal: controller.signal,
      cache: 'no-cache',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[UpdateManager] Failed to fetch version.json: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Validate required fields
    if (!data.versionCode || !data.versionName) {
      console.warn('[UpdateManager] Invalid version.json: missing versionCode or versionName');
      return null;
    }
    
    return data;
  } catch (err) {
    // Offline or network error - silent fail
    if (err.name === 'AbortError') {
      console.warn('[UpdateManager] Fetch timeout');
    } else {
      console.warn('[UpdateManager] Fetch error:', err.message);
    }
    return null;
  }
}

/**
 * Check if an update is available
 * @param {Object} versionInfo - Version info from version.json
 * @returns {Object} Update status
 */
export function checkUpdateAvailable(versionInfo) {
  if (!versionInfo) {
    return { available: false, reason: 'offline' };
  }
  
  const latestVersionCode = parseInt(versionInfo.versionCode, 10);
  const minimumVersionCode = parseInt(versionInfo.minimumVersionCode || 0, 10);
  
  if (isNaN(latestVersionCode)) {
    return { available: false, reason: 'invalid' };
  }
  
  // Simple comparison: latestVersionCode > currentVersionCode
  if (latestVersionCode > CURRENT_VERSION_CODE) {
    const isMandatory = minimumVersionCode > CURRENT_VERSION_CODE;
    return {
      available: true,
      mandatory: isMandatory,
      currentVersionCode: CURRENT_VERSION_CODE,
      currentVersionName: CURRENT_VERSION_NAME,
      latestVersionCode,
      latestVersionName: versionInfo.versionName,
      downloadUrl: versionInfo.downloadUrl,
      releaseUrl: versionInfo.releaseUrl,
      releaseNotes: versionInfo.releaseNotes || ''
    };
  }
  
  return { available: false, reason: 'up-to-date' };
}

/**
 * Open APK download URL in external browser
 * @param {string} downloadUrl - Direct APK download URL
 */
export function openDownloadUrl(downloadUrl) {
  if (!downloadUrl) {
    console.error('[UpdateManager] No downloadUrl provided');
    return;
  }
  
  try {
    // Open in external browser (works in Capacitor WebView)
    window.open(downloadUrl, '_system');
  } catch (err) {
    console.error('[UpdateManager] Failed to open download URL:', err);
    // Fallback: try normal window.open
    window.open(downloadUrl, '_blank');
  }
}

/**
 * Full update check workflow
 * @returns {Promise<Object>} Update status
 */
export async function checkForUpdate() {
  const versionInfo = await fetchVersionInfo();
  return checkUpdateAvailable(versionInfo);
}

/**
 * Get current app version info
 * @returns {Object} Current version
 */
export function getCurrentVersion() {
  return {
    versionCode: CURRENT_VERSION_CODE,
    versionName: CURRENT_VERSION_NAME
  };
}

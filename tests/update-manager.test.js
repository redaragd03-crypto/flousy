/* update-manager.test.js — Unit tests for update manager */

import { checkUpdateAvailable, getCurrentVersion } from '../src/services/update-manager.js';

const CURRENT_VERSION_CODE = 1;
const CURRENT_VERSION_NAME = '1.0';

export const tests = [
  {
    name: 'getCurrentVersion returns current version',
    fn: () => {
      const ver = getCurrentVersion();
      if (ver.versionCode !== CURRENT_VERSION_CODE) throw new Error(`Expected versionCode ${CURRENT_VERSION_CODE}, got ${ver.versionCode}`);
      if (ver.versionName !== CURRENT_VERSION_NAME) throw new Error(`Expected versionName ${CURRENT_VERSION_NAME}, got ${ver.versionName}`);
    }
  },
  {
    name: 'checkUpdateAvailable: latest > current',
    fn: () => {
      const versionInfo = {
        versionCode: 2,
        versionName: '1.1',
        minimumVersionCode: 1,
        downloadUrl: 'https://example.com/app.apk',
        releaseUrl: 'https://example.com/release',
        releaseNotes: 'New features'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (!result.available) throw new Error('Update should be available');
      if (result.mandatory) throw new Error('Update should not be mandatory');
      if (result.latestVersionCode !== 2) throw new Error('Latest version code should be 2');
      if (result.latestVersionName !== '1.1') throw new Error('Latest version name should be 1.1');
    }
  },
  {
    name: 'checkUpdateAvailable: latest == current',
    fn: () => {
      const versionInfo = {
        versionCode: 1,
        versionName: '1.0',
        minimumVersionCode: 1,
        downloadUrl: 'https://example.com/app.apk'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (result.available) throw new Error('Update should not be available');
      if (result.reason !== 'up-to-date') throw new Error('Reason should be up-to-date');
    }
  },
  {
    name: 'checkUpdateAvailable: latest < current (edge case)',
    fn: () => {
      const versionInfo = {
        versionCode: 0,
        versionName: '0.9',
        minimumVersionCode: 0,
        downloadUrl: 'https://example.com/app.apk'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (result.available) throw new Error('Update should not be available when latest < current');
    }
  },
  {
    name: 'checkUpdateAvailable: mandatory update (minimumVersionCode > current)',
    fn: () => {
      const versionInfo = {
        versionCode: 3,
        versionName: '1.2',
        minimumVersionCode: 2,
        downloadUrl: 'https://example.com/app.apk'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (!result.available) throw new Error('Update should be available');
      if (!result.mandatory) throw new Error('Update should be mandatory');
    }
  },
  {
    name: 'checkUpdateAvailable: null versionInfo (offline)',
    fn: () => {
      const result = checkUpdateAvailable(null);
      if (result.available) throw new Error('Update should not be available when offline');
      if (result.reason !== 'offline') throw new Error('Reason should be offline');
    }
  },
  {
    name: 'checkUpdateAvailable: malformed versionInfo (missing versionCode)',
    fn: () => {
      const versionInfo = {
        versionName: '1.1',
        downloadUrl: 'https://example.com/app.apk'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (result.available) throw new Error('Update should not be available with invalid data');
      if (result.reason !== 'invalid') throw new Error('Reason should be invalid');
    }
  },
  {
    name: 'checkUpdateAvailable: malformed versionInfo (invalid versionCode)',
    fn: () => {
      const versionInfo = {
        versionCode: 'not-a-number',
        versionName: '1.1',
        downloadUrl: 'https://example.com/app.apk'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (result.available) throw new Error('Update should not be available with invalid versionCode');
      if (result.reason !== 'invalid') throw new Error('Reason should be invalid');
    }
  },
  {
    name: 'checkUpdateAvailable: missing downloadUrl still returns update info',
    fn: () => {
      const versionInfo = {
        versionCode: 2,
        versionName: '1.1',
        minimumVersionCode: 1
      };
      const result = checkUpdateAvailable(versionInfo);
      if (!result.available) throw new Error('Update should be available');
      if (result.downloadUrl !== undefined) throw new Error('downloadUrl should be undefined');
    }
  },
  {
    name: 'checkUpdateAvailable: optional update (minimumVersionCode <= current)',
    fn: () => {
      const versionInfo = {
        versionCode: 2,
        versionName: '1.1',
        minimumVersionCode: 1,
        downloadUrl: 'https://example.com/app.apk'
      };
      const result = checkUpdateAvailable(versionInfo);
      if (!result.available) throw new Error('Update should be available');
      if (result.mandatory) throw new Error('Update should be optional');
    }
  }
];

export const name = 'Update Manager';

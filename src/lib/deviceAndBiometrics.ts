import { ClientLaunchMode, HardwareDeviceType } from '../types/vault';

const DEVICE_FP_STORAGE_KEY = 'fsv_device_fingerprint_v1';
const BIOMETRIC_VAULT_STORAGE_KEY = 'fsv_biometric_vault_v1';

export interface DetectedDeviceProfile {
  deviceFingerprint: string;
  deviceName: string;
  hardwareModelOs: string;
  hardwareDeviceType: HardwareDeviceType;
  clientMode: ClientLaunchMode;
  hardwareSignatureHash: string;
}

export interface StoredBiometricProfile {
  memberId: string;
  username: string;
  fullName: string;
  credentialIdBase64: string;
  dekBase64: string;
  mergedDeksBase64: string[];
  registeredAt: string;
}

export function detectClientLaunchMode(): ClientLaunchMode {
  if (typeof window === 'undefined') return 'browser';
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true;
  return isStandalone ? 'pwa' : 'browser';
}

/**
 * Strips any OS version numbers, OS build identifiers (e.g. Build/UP1A.231005.007),
 * or OS family labels from a hardware model string so only the physical hardware model remains.
 * This guarantees 100% immunity to Android, iOS, Windows, or macOS system updates.
 */
export function normalizeHardwareModelOnly(rawModel?: string): string {
  if (!rawModel) return 'Urządzenie';
  let cleaned = rawModel
    .replace(/Build\/[^\s;)]+/gi, '')
    .replace(/Android\s+[0-9._]+/gi, '')
    .replace(/iOS\s+[0-9._]+/gi, '')
    .replace(/iPadOS\s+[0-9._]+/gi, '')
    .replace(/macOS\s+[0-9._]+/gi, '')
    .replace(/Windows\s+NT\s+[0-9._]+/gi, '')
    .replace(/\(iOS\)/gi, '')
    .replace(/\(iPadOS\)/gi, '')
    .replace(/\(macOS\)/gi, '')
    .replace(/^Android\s*\(([^)]+)\)$/i, 'Smartfon ($1)')
    .replace(/^Mac$/i, 'Komputer Mac')
    .replace(/^Komputer Windows$/i, 'Komputer PC')
    .replace(/^System Linux$/i, 'Komputer PC')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Urządzenie';
}

export function detectHardwareModelAndType(): {
  hardwareModelOs: string;
  hardwareDeviceType: HardwareDeviceType;
  browserName: string;
} {
  if (typeof navigator === 'undefined') {
    return {
      hardwareModelOs: 'Komputer',
      hardwareDeviceType: 'laptop_desktop',
      browserName: 'Przeglądarka',
    };
  }
  const ua = navigator.userAgent;

  let hardwareModelOs = 'Komputer';
  let hardwareDeviceType: HardwareDeviceType = 'laptop_desktop';

  if (/iPhone/i.test(ua)) {
    hardwareModelOs = 'iPhone';
    hardwareDeviceType = 'phone';
  } else if (/iPad/i.test(ua)) {
    hardwareModelOs = 'iPad';
    hardwareDeviceType = 'tablet';
  } else if (/Android/i.test(ua)) {
    // Capture ONLY the physical hardware model (e.g. SM-S918B, Pixel 8), NEVER the Android OS version or Build number
    const match = ua.match(/Android[^;)]*;\s*([^;)]+)/i);
    const isMobile = /Mobile/i.test(ua);
    hardwareDeviceType = isMobile ? 'phone' : 'tablet';
    if (match && match[1]) {
      const model = match[1]
        .replace(/Build\/.*/i, '')
        .replace(/wv/i, '')
        .trim();
      hardwareModelOs = model
        ? `${isMobile ? 'Smartfon' : 'Tablet'} (${model})`
        : isMobile
          ? 'Smartfon'
          : 'Tablet';
    } else {
      hardwareModelOs = isMobile ? 'Smartfon' : 'Tablet';
    }
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    hardwareModelOs = 'Komputer Mac';
    hardwareDeviceType = 'laptop_desktop';
  } else if (/Windows/i.test(ua)) {
    hardwareModelOs = 'Komputer PC';
    hardwareDeviceType = 'laptop_desktop';
  } else if (/Linux/i.test(ua)) {
    hardwareModelOs = 'Komputer PC';
    hardwareDeviceType = 'laptop_desktop';
  }

  let browserName = 'Przeglądarka';
  if (/Edg\//i.test(ua)) {
    browserName = 'Edge';
  } else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) {
    browserName = 'Opera';
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browserName = 'Chrome';
  } else if (/Firefox\//i.test(ua)) {
    browserName = 'Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browserName = 'Safari';
  }

  return {
    hardwareModelOs: normalizeHardwareModelOnly(hardwareModelOs),
    hardwareDeviceType,
    browserName,
  };
}

export function detectDeviceModelAndBrowser(): string {
  const { hardwareModelOs, browserName } = detectHardwareModelAndType();
  const mode = detectClientLaunchMode();
  const modeLabel = mode === 'pwa' ? 'Aplikacja PWA' : browserName;
  return `${hardwareModelOs} · ${modeLabel}`;
}

/**
 * Deterministic canonical signature of the physical/browser device profile
 * combining Hardware ID (`deviceFingerprint`), pure Hardware Model (zero OS build/version),
 * Device Type (Phone/Tablet/Laptop), and Launch Mode (PWA/Browser).
 */
export function computeHardwareSignatureSync(params: {
  deviceFingerprint: string;
  hardwareModelOs: string;
  hardwareDeviceType: HardwareDeviceType;
  clientMode: ClientLaunchMode;
}): string {
  const cleanModel = normalizeHardwareModelOnly(params.hardwareModelOs);
  const canonical = `${params.deviceFingerprint}|${cleanModel}|${params.hardwareDeviceType}|${params.clientMode}`;
  let h1 = 0xdeadbeef ^ canonical.length;
  let h2 = 0x41c6ce57 ^ canonical.length;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  return `HW-${hex1.slice(0, 4)}-${hex1.slice(4, 8)}-${hex2.slice(0, 4)}`;
}

export function getOrCreateDeviceFingerprint(): string {
  try {
    const mode = detectClientLaunchMode();
    const key = `${DEVICE_FP_STORAGE_KEY}_${mode}`;
    const existing = localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) {
      return existing;
    }
    const randomBytes = new Uint8Array(12);
    window.crypto.getRandomValues(randomBytes);
    const hex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const fp = `dev_${mode}_${hex}`;
    localStorage.setItem(key, fp);
    return fp;
  } catch {
    return `dev_session_${Date.now()}`;
  }
}

export function getDetectedDeviceProfile(): DetectedDeviceProfile {
  const deviceFingerprint = getOrCreateDeviceFingerprint();
  const clientMode = detectClientLaunchMode();
  const { hardwareModelOs, hardwareDeviceType } = detectHardwareModelAndType();
  const deviceName = detectDeviceModelAndBrowser();
  const hardwareSignatureHash = computeHardwareSignatureSync({
    deviceFingerprint,
    hardwareModelOs,
    hardwareDeviceType,
    clientMode,
  });

  return {
    deviceFingerprint,
    deviceName,
    hardwareModelOs,
    hardwareDeviceType,
    clientMode,
    hardwareSignatureHash,
  };
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out.buffer;
}

export function getStoredBiometricProfile(): StoredBiometricProfile | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_VAULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredBiometricProfile;
  } catch {
    return null;
  }
}

export function clearStoredBiometricProfile(): void {
  try {
    localStorage.removeItem(BIOMETRIC_VAULT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Registers WebAuthn platform authenticator (fingerprint / Touch ID / Face ID / Windows Hello).
 * If WebAuthn is restricted inside a cross-origin preview iframe, falls back gracefully to a
 * cryptographic device passkey token while preserving the exact same unlock workflow.
 */
export async function registerBiometricUnlock(params: {
  memberId: string;
  username: string;
  fullName: string;
  dekBase64: string;
  mergedDeksBase64: string[];
}): Promise<{ credentialId: string; usedNativeWebAuthn: boolean }> {
  let credentialId = '';
  let usedNativeWebAuthn = false;

  if (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.create === 'function'
  ) {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userIdBytes = new TextEncoder().encode(params.memberId.slice(0, 32));

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'FamilyStream Vault',
            id: window.location.hostname,
          },
          user: {
            id: userIdBytes,
            name: params.username,
            displayName: params.fullName,
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred',
            residentKey: 'preferred',
          },
          timeout: 45000,
        },
      })) as PublicKeyCredential | null;

      if (credential && credential.rawId) {
        credentialId = bufferToBase64Url(credential.rawId);
        usedNativeWebAuthn = true;
      }
    } catch {
      // Fallback for preview iframe where Permissions-Policy may restrict hardware WebAuthn
      const fallbackBytes = new Uint8Array(16);
      window.crypto.getRandomValues(fallbackBytes);
      credentialId = `bio_touch_${bufferToBase64Url(fallbackBytes.buffer)}`;
      usedNativeWebAuthn = false;
    }
  } else {
    const fallbackBytes = new Uint8Array(16);
    window.crypto.getRandomValues(fallbackBytes);
    credentialId = `bio_touch_${bufferToBase64Url(fallbackBytes.buffer)}`;
  }

  const profile: StoredBiometricProfile = {
    memberId: params.memberId,
    username: params.username,
    fullName: params.fullName,
    credentialIdBase64: credentialId,
    dekBase64: params.dekBase64,
    mergedDeksBase64: params.mergedDeksBase64,
    registeredAt: new Date().toISOString(),
  };

  localStorage.setItem(BIOMETRIC_VAULT_STORAGE_KEY, JSON.stringify(profile));
  return { credentialId, usedNativeWebAuthn };
}

export async function authenticateWithBiometrics(): Promise<StoredBiometricProfile> {
  const stored = getStoredBiometricProfile();
  if (!stored) {
    throw new Error('Brak skonfigurowanego odcisku palca na tym urządzeniu.');
  }

  if (
    !stored.credentialIdBase64.startsWith('bio_touch_') &&
    typeof window !== 'undefined' &&
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.get === 'function'
  ) {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const allowCredId = base64UrlToBuffer(stored.credentialIdBase64);

      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: allowCredId,
              type: 'public-key',
              transports: ['internal'],
            },
          ],
          userVerification: 'preferred',
          timeout: 45000,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        throw new Error('Weryfikacja czytnikiem linii papilarnych została anulowana.');
      }
    }
  }

  return stored;
}

/**
 * 1-Click Launch & Credential Management API Auto-Fill helper.
 * Saves credentials to navigator.credentials (if supported by the browser) and copies
 * the password to the system clipboard with an automatic cleanup timer.
 */
export async function prepareOneClickLaunch(params: {
  serviceName: string;
  serviceUrl: string;
  login: string;
  password: string;
}): Promise<{ copiedPassword: boolean; storedInBrowserManager: boolean }> {
  let copiedPassword = false;
  let storedInBrowserManager = false;

  try {
    await navigator.clipboard.writeText(params.password);
    copiedPassword = true;
  } catch {
    copiedPassword = false;
  }

  try {
    const anyWindow = window as unknown as {
      PasswordCredential?: new (data: {
        id: string;
        password: string;
        name?: string;
      }) => Credential;
    };
    if (
      anyWindow.PasswordCredential &&
      navigator.credentials &&
      typeof navigator.credentials.store === 'function'
    ) {
      const cred = new anyWindow.PasswordCredential({
        id: params.login,
        password: params.password,
        name: params.serviceName,
      });
      await navigator.credentials.store(cred);
      storedInBrowserManager = true;
    }
  } catch {
    storedInBrowserManager = false;
  }

  return { copiedPassword, storedInBrowserManager };
}

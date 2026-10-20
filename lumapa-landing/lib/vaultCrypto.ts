import { base64ToBytes, bytesToBase64, bytesToString, stringToBytes } from './encoding';

const PBKDF_ITERATIONS = 310_000;

type EncryptedPayload = {
  v: 1;
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
};

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getKeyMaterial(passcode: string) {
  return crypto.subtle.importKey('raw', asBufferSource(stringToBytes(passcode)), 'PBKDF2', false, ['deriveKey']);
}

async function deriveAesKey(passcode: string, salt: Uint8Array) {
  const keyMaterial = await getKeyMaterial(passcode);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBufferSource(salt), iterations: PBKDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(plainText: string, passcode: string): Promise<string> {
  if (!passcode || passcode.length < 8) throw new Error('Use a passcode of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passcode, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, key, asBufferSource(stringToBytes(plainText)));
  const payload: EncryptedPayload = {
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted))
  };
  return bytesToBase64(stringToBytes(JSON.stringify(payload)));
}

export async function decryptText(payloadBase64: string, passcode: string): Promise<string> {
  const payload = JSON.parse(bytesToString(base64ToBytes(payloadBase64))) as EncryptedPayload;
  if (payload.v !== 1 || payload.alg !== 'AES-GCM') throw new Error('Unsupported vault payload.');
  const key = await deriveAesKey(passcode, base64ToBytes(payload.salt));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBufferSource(base64ToBytes(payload.iv)) }, key, asBufferSource(base64ToBytes(payload.data)));
  return bytesToString(new Uint8Array(decrypted));
}

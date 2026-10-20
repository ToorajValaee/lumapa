import { base64ToBytes, bytesToBase64, stringToBytes } from './encoding';

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function isWebAuthnSupported() {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials;
}

export async function registerLocalPasskey(label: string) {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported on this device/browser.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: asBufferSource(challenge),
      rp: { name: 'Lumapa Wallet' },
      user: { id: asBufferSource(userId), name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60_000,
      attestation: 'none'
    }
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error('No credential was created.');
  return bytesToBase64(new Uint8Array(credential.rawId));
}

export async function verifyLocalPasskey(credentialId: string) {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported on this device/browser.');
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: asBufferSource(stringToBytes(`lumapa-wallet-${Date.now()}`)),
      allowCredentials: [{ id: asBufferSource(base64ToBytes(credentialId)), type: 'public-key' }],
      timeout: 60_000,
      userVerification: 'required'
    }
  });
  if (!assertion) throw new Error('Approval was cancelled.');
  return true;
}

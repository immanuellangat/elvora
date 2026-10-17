import type { EncryptedPayload, LockMeta } from '../db/types'

const VERIFIER_TEXT = 'elvora-diary-v1'
export const PBKDF2_ITERATIONS = 310_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function deriveKey(passcode: string, saltB64: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  return { iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) }
}

export async function decryptJSON<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) },
    key,
    b64ToBytes(payload.data),
  )
  return JSON.parse(decoder.decode(plain)) as T
}

export async function createLock(passcode: string, iterations = PBKDF2_ITERATIONS): Promise<{ meta: LockMeta; key: CryptoKey }> {
  const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)))
  const key = await deriveKey(passcode, salt, iterations)
  const verifier = await encryptJSON(key, VERIFIER_TEXT)
  return { meta: { salt, iterations, verifier }, key }
}

/** Returns the key when the passcode is correct, otherwise null. */
export async function unlockWith(passcode: string, meta: LockMeta): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(passcode, meta.salt, meta.iterations)
    const check = await decryptJSON<string>(key, meta.verifier)
    return check === VERIFIER_TEXT ? key : null
  } catch {
    return null
  }
}

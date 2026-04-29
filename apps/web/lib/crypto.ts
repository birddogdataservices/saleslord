// AES-256-GCM encryption for user Anthropic API keys.
// Keys are encrypted before writing to the DB and decrypted only inside server-side
// API routes. The plaintext key never leaves the server.
//
// Stored format: "{iv_hex}.{authTag_hex}.{ciphertext_hex}"
// Each encryption uses a fresh random 96-bit IV — same plaintext encrypts differently each time.
//
// Required env var: API_KEY_ENCRYPTION_SECRET — 64 hex chars (32 bytes)
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getSecret(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error('API_KEY_ENCRYPTION_SECRET is not set')
  const buf = Buffer.from(secret, 'hex')
  if (buf.length !== 32) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be exactly 64 hex characters (32 bytes)')
  }
  return buf
}

export function encryptApiKey(plaintext: string): string {
  const key = getSecret()
  const iv  = randomBytes(12) // 96-bit IV — recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`
}

export function decryptApiKey(stored: string): string {
  const key   = getSecret()
  const parts = stored.split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted key format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv         = Buffer.from(ivHex, 'hex')
  const authTag    = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

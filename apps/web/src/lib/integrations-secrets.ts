import crypto from 'crypto'

const INTEGRATIONS_SECRET_VERSION = 'v1'

function loadEncryptionKey(): Buffer {
  const raw = (process.env.INTEGRATIONS_ENCRYPTION_KEY_BASE64 || '').trim()
  if (!raw) {
    throw new Error('Missing INTEGRATIONS_ENCRYPTION_KEY_BASE64')
  }

  let decoded: Buffer
  try {
    decoded = Buffer.from(raw, 'base64')
  } catch {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY_BASE64 must be valid base64')
  }

  if (decoded.length !== 32) {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY_BASE64 must decode to 32 bytes (AES-256-GCM key)')
  }

  return decoded
}

export function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 8) return '****'
  const prefix = trimmed.slice(0, 4)
  const suffix = trimmed.slice(-4)
  return `${prefix}…${suffix}`
}

export function encryptIntegrationCredentials(credentials: unknown): string {
  const key = loadEncryptionKey()

  const iv = crypto.randomBytes(12) // recommended IV size for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  // v1.<iv>.<tag>.<ciphertext> (base64url)
  return [
    INTEGRATIONS_SECRET_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptIntegrationCredentials<T = unknown>(encrypted: string): T {
  const key = loadEncryptionKey()

  const parts = encrypted.split('.')
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted credentials format')
  }

  const [version, ivB64, tagB64, ciphertextB64] = parts
  if (version !== INTEGRATIONS_SECRET_VERSION) {
    throw new Error(`Unsupported encrypted credentials version: ${version}`)
  }

  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ciphertext = Buffer.from(ciphertextB64, 'base64url')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return JSON.parse(plaintext) as T
}


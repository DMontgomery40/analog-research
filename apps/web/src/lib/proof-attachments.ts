const PROOF_ATTACHMENTS_BUCKET = 'proof-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

type AttachmentInput = {
  name: string
  type: string
  path?: string
  url?: string
}

export type ProofAttachmentRecord = {
  name: string
  type: string
  path?: string
  url?: string
}

function parseAttachment(raw: unknown): ProofAttachmentRecord | null {
  if (!raw || typeof raw !== 'object') return null

  const value = raw as Record<string, unknown>
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null
  const type = typeof value.type === 'string' && value.type.trim()
    ? value.type.trim()
    : 'application/octet-stream'
  const path = typeof value.path === 'string' && value.path.trim() ? value.path.trim() : null
  const url = typeof value.url === 'string' && value.url.trim() ? value.url.trim() : null

  if (!name) return null
  if (!path && !url) return null

  return {
    name,
    type,
    ...(path ? { path } : {}),
    ...(url ? { url } : {}),
  }
}

function extractPathFromPublicUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const markers = [
      `/storage/v1/object/public/${PROOF_ATTACHMENTS_BUCKET}/`,
      `/object/public/${PROOF_ATTACHMENTS_BUCKET}/`,
    ]

    for (const marker of markers) {
      const markerIndex = parsed.pathname.indexOf(marker)
      if (markerIndex !== -1) {
        const encodedPath = parsed.pathname.slice(markerIndex + marker.length)
        return decodeURIComponent(encodedPath)
      }
    }

    return null
  } catch {
    return null
  }
}

export function normalizeProofAttachmentsForInsert(
  attachments: AttachmentInput[] | undefined,
  bookingId: string
): { attachments: ProofAttachmentRecord[]; error: string | null } {
  const normalized: ProofAttachmentRecord[] = []

  for (const attachment of attachments ?? []) {
    const path = attachment.path?.trim() || null
    const url = attachment.url?.trim() || null
    const name = attachment.name.trim()
    const type = attachment.type.trim() || 'application/octet-stream'

    if (!path && !url) {
      return { attachments: [], error: 'Each attachment must include a path or URL' }
    }

    if (path) {
      if (!path.startsWith(`${bookingId}/`)) {
        return { attachments: [], error: 'Attachment paths must belong to the booking' }
      }

      normalized.push({ name, type, path })
      continue
    }

    normalized.push({ name, type, url: url! })
  }

  return { attachments: normalized, error: null }
}

export async function resolveProofAttachmentsForResponse(
  serviceClient: any,
  attachmentsRaw: unknown
): Promise<ProofAttachmentRecord[]> {
  if (!Array.isArray(attachmentsRaw)) return []

  const attachments = attachmentsRaw
    .map(parseAttachment)
    .filter((attachment): attachment is ProofAttachmentRecord => Boolean(attachment))

  const resolved: ProofAttachmentRecord[] = []

  for (const attachment of attachments) {
    const path = attachment.path || (attachment.url ? extractPathFromPublicUrl(attachment.url) : null)

    if (!path) {
      resolved.push(attachment)
      continue
    }

    const { data, error } = await serviceClient.storage
      .from(PROOF_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

    if (!error && data?.signedUrl) {
      resolved.push({ ...attachment, path, url: data.signedUrl })
      continue
    }

    resolved.push({
      ...attachment,
      ...(path ? { path } : {}),
    })
  }

  return resolved
}

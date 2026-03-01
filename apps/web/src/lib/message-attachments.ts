const MESSAGE_ATTACHMENTS_BUCKET = 'proof-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

type AttachmentInput = {
  name: string
  type: string
  path?: string
  url?: string
}

export type MessageAttachmentRecord = {
  name: string
  type: string
  path?: string
  url?: string
}

function parseAttachment(raw: unknown): MessageAttachmentRecord | null {
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
      `/storage/v1/object/public/${MESSAGE_ATTACHMENTS_BUCKET}/`,
      `/object/public/${MESSAGE_ATTACHMENTS_BUCKET}/`,
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

const buildAllowedPathPrefixes = (conversationId: string) => ([
  `${conversationId}/`,
  `conversations/${conversationId}/`,
])

function pathBelongsToConversation(path: string, conversationId: string): boolean {
  const prefixes = buildAllowedPathPrefixes(conversationId)
  return prefixes.some((prefix) => path.startsWith(prefix))
}

export function normalizeMessageAttachmentsForInsert(
  attachments: AttachmentInput[] | undefined,
  conversationId: string
): { attachments: MessageAttachmentRecord[]; error: string | null } {
  const normalized: MessageAttachmentRecord[] = []

  for (const attachment of attachments ?? []) {
    const name = attachment.name.trim()
    const type = attachment.type.trim() || 'application/octet-stream'
    const path = attachment.path?.trim() || null
    const url = attachment.url?.trim() || null

    if (!path && !url) {
      return { attachments: [], error: 'Each attachment must include a path or URL' }
    }

    if (path) {
      if (!pathBelongsToConversation(path, conversationId)) {
        return { attachments: [], error: 'Attachment paths must belong to the conversation' }
      }

      normalized.push({ name, type, path })
      continue
    }

    const extractedPath = url ? extractPathFromPublicUrl(url) : null
    if (extractedPath) {
      if (!pathBelongsToConversation(extractedPath, conversationId)) {
        return { attachments: [], error: 'Attachment URLs must belong to the conversation' }
      }
      normalized.push({ name, type, path: extractedPath })
      continue
    }

    normalized.push({ name, type, url: url! })
  }

  return { attachments: normalized, error: null }
}

export async function resolveMessageAttachmentsForResponse(
  serviceClient: any,
  attachmentsRaw: unknown,
  conversationId?: string
): Promise<MessageAttachmentRecord[]> {
  if (!Array.isArray(attachmentsRaw)) return []

  const attachments = attachmentsRaw
    .map(parseAttachment)
    .filter((attachment): attachment is MessageAttachmentRecord => Boolean(attachment))

  const resolved: MessageAttachmentRecord[] = []

  for (const attachment of attachments) {
    const path = attachment.path || (attachment.url ? extractPathFromPublicUrl(attachment.url) : null)

    if (!path) {
      resolved.push(attachment)
      continue
    }

    if (conversationId && !pathBelongsToConversation(path, conversationId)) {
      resolved.push({
        ...attachment,
        ...(attachment.path ? { path: attachment.path } : {}),
      })
      continue
    }

    const { data, error } = await serviceClient.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
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

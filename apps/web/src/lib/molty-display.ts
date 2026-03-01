const LEGACY_OWNER_AGENT_NAME_REGEX = /^human_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isLegacyOwnerAgentName(name: string | null | undefined): boolean {
  if (!name) {
    return false
  }

  return LEGACY_OWNER_AGENT_NAME_REGEX.test(name.trim())
}

export function formatResearchAgentDisplayName(name: string | null | undefined): string {
  const normalized = (name || '').trim()
  if (!normalized) {
    return 'ResearchAgent'
  }

  if (isLegacyOwnerAgentName(normalized)) {
    return 'ResearchAgent Owner'
  }

  return normalized
}

// Backward-compatible alias for legacy callsites.
export const formatMoltyDisplayName = formatResearchAgentDisplayName

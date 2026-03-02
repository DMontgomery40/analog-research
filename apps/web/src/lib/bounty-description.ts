function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractLabeledLine(description: string, label: string): string | null {
  const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*:\\s*(.+?)\\s*$`, 'im')
  const match = description.match(pattern)
  if (!match?.[1]) return null
  const value = match[1].trim()
  return value.length > 0 ? value : null
}

function removeLabeledLine(description: string, label: string): string {
  const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*:\\s*.+?\\s*$`, 'im')
  return description.replace(pattern, '')
}

export interface ParsedBountyDescription {
  location: string | null
  context: string | null
  body: string
}

export function parseBountyDescription(description: string): ParsedBountyDescription {
  const safeDescription = description || ''
  const location = extractLabeledLine(safeDescription, 'Location')
  const context = extractLabeledLine(safeDescription, 'Context')

  const body = removeLabeledLine(removeLabeledLine(safeDescription, 'Location'), 'Context')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    location,
    context,
    body,
  }
}

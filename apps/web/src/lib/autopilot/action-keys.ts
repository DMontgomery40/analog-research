import { createHash } from 'crypto'

export const hashAutopilotAction = (payload: unknown) =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex')

export const buildPendingBountyActionKey = (seed: unknown, index: number) =>
  hashAutopilotAction({ seed, index })

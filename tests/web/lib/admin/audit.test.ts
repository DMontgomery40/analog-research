import { describe, expect, it } from 'vitest'

import type { AdminAction, AuditLogInput } from '@/lib/admin/audit'

/**
 * Unit tests for admin audit types and data structures.
 *
 * The actual audit functions (logAdminAction, getAuditLog, getRecentAdminActions)
 * require a real Supabase connection. Integration tests for these should be run
 * against a test database.
 */

describe('admin/audit types', () => {
  describe('AdminAction type', () => {
    it('includes all required action types', () => {
      // Type assertion - if these compile, the types are correct
      const actions: AdminAction[] = [
        'human.verify',
        'human.unverify',
        'dispute.update_status',
        'dispute.resolve',
        'bounty.suppress',
        'bounty.unsuppress',
        'moderation.update_config',
        'moderation.rescan_queue.retry',
        'moderation.rescan_queue.mark_failed',
        'moderation.rescan_queue.mark_completed',
      ]

      expect(actions).toHaveLength(10)
      actions.forEach((action) => {
        expect(action).toMatch(/^[a-z]+\.[a-z_]+/)
      })
    })
  })

  describe('AuditLogInput type', () => {
    it('accepts valid minimal input', () => {
      const input: AuditLogInput = {
        action: 'human.verify',
        adminEmail: 'admin@example.com',
        adminUserId: 'user-123',
        targetType: 'human',
        targetId: 'human-456',
      }

      expect(input.action).toBe('human.verify')
      expect(input.adminEmail).toBe('admin@example.com')
      expect(input.adminUserId).toBe('user-123')
      expect(input.targetType).toBe('human')
      expect(input.targetId).toBe('human-456')
      expect(input.beforeState).toBeUndefined()
      expect(input.afterState).toBeUndefined()
      expect(input.notes).toBeUndefined()
    })

    it('accepts valid input with all optional fields', () => {
      const input: AuditLogInput = {
        action: 'human.unverify',
        adminEmail: 'admin@example.com',
        adminUserId: 'user-123',
        targetType: 'human',
        targetId: 'human-456',
        beforeState: { is_verified: true, verified_at: '2024-01-01T00:00:00Z' },
        afterState: { is_verified: false, verified_at: null },
        notes: 'Failed re-verification check',
      }

      expect(input.beforeState).toEqual({ is_verified: true, verified_at: '2024-01-01T00:00:00Z' })
      expect(input.afterState).toEqual({ is_verified: false, verified_at: null })
      expect(input.notes).toBe('Failed re-verification check')
    })

    it('supports all target types', () => {
      const targetTypes: AuditLogInput['targetType'][] = [
        'human',
        'dispute',
        'bounty',
        'booking',
        'config',
        'moderation_rescan_queue',
      ]

      targetTypes.forEach((targetType) => {
        const input: AuditLogInput = {
          action: 'human.verify',
          adminEmail: 'admin@example.com',
          adminUserId: 'user-123',
          targetType,
          targetId: 'target-123',
        }
        expect(input.targetType).toBe(targetType)
      })
    })
  })
})

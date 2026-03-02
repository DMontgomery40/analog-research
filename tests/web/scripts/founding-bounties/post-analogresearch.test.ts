import { describe, expect, it } from 'vitest'

import { analogLaborBounties } from '../../../../scripts/founding-bounties/data.mjs'
import {
  buildBountyPatch,
  planFoundingBountyActions,
  resolveRoleForExistingBounty,
} from '../../../../scripts/founding-bounties/post-analogresearch.mjs'

describe('founding bounties reconciliation planning', () => {
  it('resolves role from track URL first, then title fallback', () => {
    expect(resolveRoleForExistingBounty({
      title: 'Unrelated title',
      description: 'Apply at: https://analog-research.org/founding-partner-apply?track=security&source=analogresearch',
    })).toBe('security')

    expect(resolveRoleForExistingBounty({
      title: 'Founding Marketing Partner Opportunity',
      description: 'No track URL in this body',
    })).toBe('marketing')
  })

  it('plans update vs create vs unchanged actions idempotently', () => {
    const legalTarget = analogLaborBounties.find((row) => row.role === 'legal')
    const securityTarget = analogLaborBounties.find((row) => row.role === 'security')
    if (!legalTarget || !securityTarget) {
      throw new Error('Missing legal/security target in founding bounty fixture data')
    }

    const existingRows = [
      {
        id: 'legal-existing',
        title: 'Founding Legal Partner',
        description: 'Apply at: https://analog-research.org/founding-partner-apply?track=legal&source=analogresearch',
        skills_required: ['legal'],
        budget_min: 100,
        budget_max: 200,
      },
      {
        id: 'security-existing',
        title: securityTarget.title,
        description: securityTarget.description,
        skills_required: securityTarget.skills_required,
        budget_min: securityTarget.budget_min,
        budget_max: securityTarget.budget_max,
      },
    ]

    const actions = planFoundingBountyActions(existingRows, analogLaborBounties)

    expect(actions).toHaveLength(4)
    expect(actions.filter((action) => action.kind === 'create').map((action) => action.role).sort())
      .toEqual(['devops', 'marketing'])
    expect(actions.filter((action) => action.kind === 'update').map((action) => action.role))
      .toEqual(['legal'])
    expect(actions.filter((action) => action.kind === 'unchanged').map((action) => action.role))
      .toEqual(['security'])

    const legalUpdate = actions.find((action) => action.kind === 'update' && action.role === 'legal')
    if (!legalUpdate || legalUpdate.kind !== 'update') {
      throw new Error('Expected legal update action')
    }
    expect(legalUpdate.patch).toEqual({
      title: legalTarget.title,
      description: legalTarget.description,
      skills_required: legalTarget.skills_required,
      budget_min: legalTarget.budget_min,
      budget_max: legalTarget.budget_max,
    })
  })

  it('returns null patch for already-aligned founding bounty rows', () => {
    const target = analogLaborBounties[0]
    const patch = buildBountyPatch({
      title: target.title,
      description: target.description,
      skills_required: target.skills_required,
      budget_min: target.budget_min,
      budget_max: target.budget_max,
    }, target)

    expect(patch).toBeNull()
  })
})

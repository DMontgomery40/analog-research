'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Scale, Shield, Server, Megaphone } from 'lucide-react'

type RoleTrack = 'legal' | 'security' | 'devops' | 'marketing' | 'multi'

const ROLE_OPTIONS: Array<{ value: RoleTrack; label: string }> = [
  { value: 'legal', label: 'Legal' },
  { value: 'security', label: 'Security' },
  { value: 'devops', label: 'DevOps' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'multi', label: 'Multi-Track' },
]

const ROLE_DESCRIPTIONS: Record<RoleTrack, { icon: typeof Scale; title: string; description: string }> = {
  legal: {
    icon: Scale,
    title: 'Legal Partner',
    description: 'What happens when an AI sends a human into a dangerous situation? You\'ll define the legal architecture for prevention, response, and liability. This includes contractor classification, platform liability shields, incident response protocols, and building relationships with regulators before they come looking.',
  },
  security: {
    icon: Shield,
    title: 'Security Partner',
    description: 'Prevent a compromised agent from booking 1000 humans. Design task risk scoring, dispatch guardrails, and kill switches. You\'ll build the infrastructure that catches runaway agents, detects anomalous booking patterns, and ensures we can pause operations globally in seconds.',
  },
  devops: {
    icon: Server,
    title: 'DevOps Partner',
    description: 'Safety-grade operations for a live marketplace coordinating physical work. Observability, audit trails, incident runbooks. When an agent goes rogue at 3am, you\'re the one who built the systems that alert the right people and have the runbooks ready.',
  },
  marketing: {
    icon: Megaphone,
    title: 'Marketing Partner',
    description: 'Tell this story honestly. Build trust without hype. Prepare for crisis communications. You\'re not spinning a narrative—you\'re explaining what we\'re building to humans who are understandably skeptical and making sure they know we take this seriously.',
  },
  multi: {
    icon: Shield,
    title: 'Multi-Track Application',
    description: 'You have expertise across multiple domains and want us to evaluate you for the best fit. Describe your relevant experience across Legal, Security, DevOps, and/or Marketing in your application.',
  },
}

const SOURCE_OPTIONS = new Set(['analoglabor', 'rentahuman', 'direct'])

function sanitizeRoleTrack(value: string | null): RoleTrack {
  if (!value) return 'multi'
  const normalized = value.toLowerCase()
  if (normalized === 'legal') return 'legal'
  if (normalized === 'security') return 'security'
  if (normalized === 'devops') return 'devops'
  if (normalized === 'marketing') return 'marketing'
  return 'multi'
}

function sanitizeSource(value: string | null): string {
  if (!value) return 'direct'
  const normalized = value.toLowerCase()
  return SOURCE_OPTIONS.has(normalized) ? normalized : 'direct'
}

export function FoundingPartnerApplyForm() {
  const searchParams = useSearchParams()

  const initialRole = useMemo(() => sanitizeRoleTrack(searchParams.get('track')), [searchParams])
  const source = useMemo(() => sanitizeSource(searchParams.get('source')), [searchParams])

  const [roleTrack, setRoleTrack] = useState<RoleTrack>(initialRole)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [whyBestFit, setWhyBestFit] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const roleInfo = ROLE_DESCRIPTIONS[roleTrack]
  const RoleIcon = roleInfo.icon

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const hasLinkedin = linkedinUrl.trim().length > 0
    const hasGithub = githubUrl.trim().length > 0

    if (!hasLinkedin && !hasGithub) {
      setValidationError('Please provide at least one profile URL: LinkedIn or GitHub.')
      return
    }

    if (whyBestFit.trim().length < 100 || whyBestFit.trim().length > 30000) {
      setValidationError('Why best fit must be between 100 and 30,000 characters.')
      return
    }

    setValidationError(null)
    setIsSubmitting(true)

    try {
      // Submit to Netlify Forms via fetch
      const formData = new URLSearchParams()
      formData.append('form-name', 'founding_partner_application_v1')
      formData.append('bot-field', '')
      formData.append('role_track', roleTrack)
      formData.append('full_name', fullName)
      formData.append('email', email)
      formData.append('linkedin_url', linkedinUrl)
      formData.append('github_url', githubUrl)
      formData.append('why_best_fit', whyBestFit)
      formData.append('source', source)

      const response = await fetch('/netlify-forms.html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })

      if (response.ok) {
        router.push('/founding-partner-apply/success')
      } else {
        setValidationError('Failed to submit application. Please try again.')
      }
    } catch {
      setValidationError('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background py-12">
      <div className="mx-auto w-full max-w-3xl px-4">
        {/* Header with context */}
        <div className="mb-8">
          <Link href="/" className="text-sm text-primary hover:underline">Home</Link>
          <h1 className="mt-2 text-3xl font-bold">Analog Research Founding Partner Application</h1>
        </div>

        {/* Preamble - "We're Not Looking for Advisors" */}
        <div className="mb-8 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-6">
          <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-4">
            We&apos;re Not Looking for Advisors
          </h2>
          <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
            The founding partner roles at Analog Research come with significant founding equity and real responsibility, allocated by contribution. This isn&apos;t a consulting gig. It&apos;s co-ownership of a company building something that could go very wrong if we&apos;re not careful.
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >

            {/* Role Track Selector */}
            <div className="grid gap-2">
              <label htmlFor="role_track" className="text-sm font-medium">Role track</label>
              <select
                id="role_track"
                name="role_track"
                value={roleTrack}
                onChange={(event) => setRoleTrack(event.target.value as RoleTrack)}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                required
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Role-specific description */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                  <RoleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{roleInfo.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {roleInfo.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <label htmlFor="full_name" className="text-sm font-medium">Full name</label>
              <input
                id="full_name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="linkedin_url" className="text-sm font-medium">LinkedIn URL (optional)</label>
              <input
                id="linkedin_url"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="https://www.linkedin.com/in/your-name"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="github_url" className="text-sm font-medium">GitHub URL (optional)</label>
              <input
                id="github_url"
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="https://github.com/your-handle"
              />
              <p className="text-xs text-muted-foreground">At least one of LinkedIn or GitHub is required.</p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="why_best_fit" className="text-sm font-medium">Why you are the best fit</label>
              <textarea
                id="why_best_fit"
                value={whyBestFit}
                onChange={(e) => setWhyBestFit(e.target.value)}
                minLength={100}
                maxLength={30000}
                className="min-h-40 rounded-md border border-border bg-background p-3 text-sm"
                placeholder="Minimum 100 characters."
                required
              />
              <p className="text-xs text-muted-foreground">
                {whyBestFit.length} / 30000 characters (minimum 100)
              </p>
            </div>

            {validationError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {validationError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit application'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

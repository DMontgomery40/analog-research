'use client'

import Link from 'next/link'
import { MapPin, Star, DollarSign, Github, Linkedin, Instagram, Youtube, Globe, Twitter } from 'lucide-react'
import { QualityScoreBadge } from '@/components/quality-score-badge'

interface SocialLinks {
  github?: string
  linkedin?: string
  instagram?: string
  youtube?: string
  website?: string
  x?: string
  website_2?: string
  website_3?: string
}

export interface Human {
  id: string
  name: string
  bio: string | null
  avatar_url: string | null
  location: string | null
  timezone: string | null
  skills: string[]
  rate_min: number
  rate_max: number
  rating_average: number | null
  rating_count: number
  is_verified: boolean
  completed_bookings: number
  human_legitimacy_score?: number
  human_legitimacy_confidence?: number
  social_links?: SocialLinks
}

interface HumanCardProps {
  human: Human
}

export function HumanCard({ human }: HumanCardProps) {

  return (
    <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          {human.avatar_url ? (
            <img
              src={human.avatar_url}
              alt={human.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <span className="text-2xl font-medium text-primary">
              {human.name?.[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg truncate">{human.name}</h3>
            {human.is_verified && (
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full text-xs font-medium">
                Verified
              </span>
            )}
            <QualityScoreBadge
              label="HLS"
              score={human.human_legitimacy_score}
              confidence={human.human_legitimacy_confidence}
            />
          </div>

          {human.bio && (
            <p className="text-muted-foreground text-sm whitespace-pre-line line-clamp-4 mb-3">
              {human.bio}
            </p>
          )}

          {/* Skills */}
          {human.skills && human.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {human.skills.slice(0, 4).map((skill) => (
                <span
                  key={skill}
                  className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
                >
                  {skill}
                </span>
              ))}
              {human.skills.length > 4 && (
                <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs">
                  +{human.skills.length - 4} more
                </span>
              )}
            </div>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {/* Rate */}
            {(human.rate_min > 0 || human.rate_max > 0) && (
              <div className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                <span>
                  ${(human.rate_min / 100).toFixed(0)}
                  {human.rate_max > human.rate_min && ` - $${(human.rate_max / 100).toFixed(0)}`}
                  /hr
                </span>
              </div>
            )}

            {/* Rating */}
            {human.rating_average && human.rating_count > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>
                  {human.rating_average.toFixed(1)} ({human.rating_count})
                </span>
              </div>
            )}

            {/* Location */}
            {human.location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{human.location}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border/70 flex items-center justify-between gap-3">
            <Link
              href={`/humans/${human.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              View profile
            </Link>

            <div className="flex items-center gap-2">
              {human.social_links?.website && (
                <a
                  href={human.social_links.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  title="Website"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.website_2 && (
                <a
                  href={human.social_links.website_2}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website 2"
                  title="Website 2"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.website_3 && (
                <a
                  href={human.social_links.website_3}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website 3"
                  title="Website 3"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.github && (
                <a
                  href={human.social_links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  title="GitHub"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Github className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.x && (
                <a
                  href={human.social_links.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="X"
                  title="X"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Twitter className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.linkedin && (
                <a
                  href={human.social_links.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  title="LinkedIn"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.instagram && (
                <a
                  href={human.social_links.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  title="Instagram"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {human.social_links?.youtube && (
                <a
                  href={human.social_links.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  title="YouTube"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Youtube className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

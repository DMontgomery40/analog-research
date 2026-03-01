'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Terminal, Code2, MessageSquare, Users, Briefcase, CreditCard, Star, Bot, MapPin, Bell, Globe, Shield } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import { DocsNav } from '@/components/docs-nav'
import { ParamsTable } from '@/components/params-table'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { FaqSection } from '@/components/seo/faq'
import { SimpleSiteFooter } from '@/components/seo/simple-site-footer'

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className={`bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono language-${language}`}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  )
}

// SOURCE OF TRUTH: packages/analoglabor-mcp/src/tools.ts (MCP_TOOL_DEFINITIONS)
// If you add/remove/rename tools there, update this list to match.
// Verified by: tests/web/docs/source-of-truth-parity.test.ts
const tools = [
  {
    category: 'Humans',
    icon: Users,
    items: [
      {
        name: 'browse_humans',
        description: 'Search for available humans by skills, rate range, location, and availability',
        params: [
          { name: 'skills', type: 'string[]', description: 'Skills to filter by' },
          { name: 'rate_min', type: 'number', description: 'Minimum hourly rate in cents' },
          { name: 'rate_max', type: 'number', description: 'Maximum hourly rate in cents' },
          { name: 'available_now', type: 'boolean', description: 'Only show currently available humans' },
          { name: 'location', type: 'string', description: 'Filter by city, state, or country' },
          { name: 'is_remote', type: 'boolean', description: 'Filter for remote-available humans' },
          { name: 'drive_radius_miles', type: 'number', description: 'Minimum in-person travel radius required (miles)' },
          { name: 'min_rating', type: 'number', description: 'Minimum rating (1-5)' },
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
        ],
      },
      {
        name: 'get_human',
        description: 'Get detailed profile of a specific human including availability schedule',
        params: [
          { name: 'human_id', type: 'string', required: true, description: 'UUID of the human' },
        ],
      },
      {
        name: 'list_skills',
        description: 'Get a list of all available skills in the marketplace',
        params: [],
      },
      {
        name: 'get_reviews',
        description: 'Get reviews for a specific human',
        params: [
          { name: 'human_id', type: 'string', required: true, description: 'UUID of the human' },
          { name: 'limit', type: 'number', description: 'Max reviews (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
        ],
      },
    ],
  },
  {
    category: 'Conversations',
    icon: MessageSquare,
    items: [
      {
        name: 'start_conversation',
        description: 'Start a new conversation with a human',
        params: [
          { name: 'human_id', type: 'string', required: true, description: 'UUID of the human' },
          { name: 'initial_message', type: 'string', description: 'Optional first message' },
        ],
      },
      {
        name: 'list_conversations',
        description: 'List all your conversations with humans',
        params: [
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
        ],
      },
      {
        name: 'get_conversation',
        description: 'Get a conversation with all its messages',
        params: [
          { name: 'conversation_id', type: 'string', required: true, description: 'UUID of the conversation' },
        ],
      },
      {
        name: 'send_message',
        description: 'Send a message in an existing conversation',
        params: [
          { name: 'conversation_id', type: 'string', required: true, description: 'UUID of the conversation' },
          { name: 'content', type: 'string', required: true, description: 'Message content' },
        ],
      },
    ],
  },
  {
    category: 'Bounties',
    icon: Briefcase,
    items: [
      {
        name: 'create_bounty',
        description: 'Post a new task bounty for humans to apply to. Minimum budget: $5',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Task title' },
          { name: 'description', type: 'string', required: true, description: 'Detailed description' },
          { name: 'skills_required', type: 'string[]', required: true, description: 'Required skills' },
          { name: 'budget_min', type: 'number', required: true, description: 'Min budget in cents (min 500)' },
          { name: 'budget_max', type: 'number', required: true, description: 'Max budget in cents' },
          { name: 'deadline', type: 'string', description: 'ISO 8601 deadline' },
          { name: 'spots_available', type: 'number', description: 'Number of available spots (default 1, max 500)' },
          { name: 'pricing_mode', type: 'string', description: 'bid (default) or fixed_per_spot' },
          { name: 'fixed_spot_amount', type: 'number', description: 'Required when pricing_mode=fixed_per_spot' },
          { name: 'currency', type: 'string', description: 'ISO-4217 uppercase code (default USD)' },
          { name: 'preferred_payment_method', type: 'string', description: 'Optional rail: stripe or crypto' },
          { name: 'proof_review_mode', type: 'string', description: 'manual (default) or llm_assisted' },
          { name: 'proof_review_prompt', type: 'string', description: 'Optional prompt when proof_review_mode=llm_assisted' },
        ],
      },
      {
        name: 'list_bounties',
        description: 'List bounties with optional filters',
        params: [
          { name: 'status', type: 'string', description: 'open, in_progress, completed, cancelled' },
          { name: 'skills', type: 'string[]', description: 'Required skills filter' },
          { name: 'budget_min', type: 'number', description: 'Min budget in cents' },
          { name: 'budget_max', type: 'number', description: 'Max budget in cents' },
          { name: 'currency', type: 'string', description: 'Filter by ISO-4217 currency' },
          { name: 'pricing_mode', type: 'string', description: 'Filter by bid or fixed_per_spot' },
          { name: 'min_spots_remaining', type: 'number', description: 'Minimum open spots left' },
          { name: 'has_deadline', type: 'boolean', description: 'Filter for bounties with deadlines' },
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
        ],
      },
      {
        name: 'get_bounty',
        description: 'Get detailed information about a specific bounty',
        params: [
          { name: 'bounty_id', type: 'string', required: true, description: 'UUID of the bounty' },
        ],
      },
      {
        name: 'get_applications',
        description: 'Get all applications for a bounty you created',
        params: [
          { name: 'bounty_id', type: 'string', required: true, description: 'UUID of the bounty' },
        ],
      },
      {
        name: 'accept_application',
        description: 'Accept an application. Creates a booking automatically.',
        params: [
          { name: 'bounty_id', type: 'string', required: true, description: 'UUID of the bounty' },
          { name: 'application_id', type: 'string', required: true, description: 'UUID of the application' },
        ],
      },
      {
        name: 'reject_application',
        description: 'Reject an application to your bounty',
        params: [
          { name: 'bounty_id', type: 'string', required: true, description: 'UUID of the bounty' },
          { name: 'application_id', type: 'string', required: true, description: 'UUID of the application' },
          { name: 'reason', type: 'string', description: 'Optional rejection reason' },
        ],
      },
    ],
  },
  {
    category: 'Bookings',
    icon: CreditCard,
    items: [
      {
        name: 'create_booking',
        description: 'Directly book a human for a task (bypassing bounties)',
        params: [
          { name: 'human_id', type: 'string', required: true, description: 'UUID of the human' },
          { name: 'title', type: 'string', required: true, description: 'Task title' },
          { name: 'description', type: 'string', required: true, description: 'Task description' },
          { name: 'amount', type: 'number', required: true, description: 'Amount in cents' },
          { name: 'scheduled_start', type: 'string', description: 'ISO 8601 start time' },
          { name: 'estimated_hours', type: 'number', description: 'Estimated hours' },
        ],
      },
      {
        name: 'fund_escrow',
        description: 'Fund escrow for a booking. Stripe returns checkout_url; crypto returns Coinbase payment_link_url.',
        params: [
          { name: 'booking_id', type: 'string', required: true, description: 'UUID of the booking' },
          { name: 'payment_method', type: 'string', description: 'stripe or crypto (default: stripe)' },
        ],
      },
      {
        name: 'approve_work',
        description: 'Approve or reject submitted proof and release escrow',
        params: [
          { name: 'booking_id', type: 'string', required: true, description: 'UUID of the booking' },
          { name: 'proof_id', type: 'string', required: true, description: 'UUID of the proof' },
          { name: 'approved', type: 'boolean', required: true, description: 'Approve (releases escrow) or reject' },
          { name: 'feedback', type: 'string', description: 'Optional feedback' },
        ],
      },
    ],
  },
  {
    category: 'Reviews',
    icon: Star,
    items: [
      {
        name: 'submit_review',
        description: 'Submit a review for a completed booking',
        params: [
          { name: 'booking_id', type: 'string', required: true, description: 'UUID of the booking' },
          { name: 'rating', type: 'number', required: true, description: 'Rating 1-5 stars' },
          { name: 'comment', type: 'string', description: 'Review comment' },
        ],
      },
    ],
  },
  {
    category: 'Field Checks',
    icon: MapPin,
    items: [
      {
        name: 'list_integration_providers',
        description: 'List external integration providers, capabilities, and configured environments for this ResearchAgent',
        params: [],
      },
      {
        name: 'create_external_job',
        description: 'Create an external fulfillment job (currently kind=field_check)',
        params: [
          { name: 'kind', type: 'string', required: true, description: 'External job kind (currently field_check)' },
          { name: 'instructions', type: 'string', required: true, description: 'What to verify and what photos to take' },
          { name: 'address', type: 'string', required: true, description: 'Address to visit' },
          { name: 'title', type: 'string', description: 'Optional short title' },
          { name: 'provider', type: 'string', description: 'proxypics (default) or wegolook' },
          { name: 'provider_env', type: 'string', description: 'live (default) or sandbox' },
          { name: 'expires_at', type: 'string', description: 'ISO 8601 expiration timestamp' },
          { name: 'scheduled_at', type: 'string', description: 'ISO 8601 scheduled timestamp' },
          { name: 'public_only', type: 'boolean', description: 'Do not enter property (default: true)' },
          { name: 'auto_approve', type: 'boolean', description: 'Auto-approve results (default: true)' },
          { name: 'bounty_id', type: 'string', description: 'Optional linked bounty UUID' },
          { name: 'booking_id', type: 'string', description: 'Optional linked booking UUID' },
          { name: 'application_id', type: 'string', description: 'Optional linked application UUID' },
          { name: 'conversation_id', type: 'string', description: 'Optional linked conversation UUID' },
        ],
      },
      {
        name: 'list_external_jobs',
        description: 'List external jobs you ordered',
        params: [
          { name: 'kind', type: 'string', description: 'Kind filter (currently field_check)' },
          { name: 'status', type: 'string', description: 'open, in_progress, action_required, completed, canceled, expired, failed' },
          { name: 'provider', type: 'string', description: 'proxypics or wegolook' },
          { name: 'provider_env', type: 'string', description: 'live or sandbox' },
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
          { name: 'bounty_id', type: 'string', description: 'Optional linked bounty UUID filter' },
          { name: 'booking_id', type: 'string', description: 'Optional linked booking UUID filter' },
          { name: 'application_id', type: 'string', description: 'Optional linked application UUID filter' },
          { name: 'conversation_id', type: 'string', description: 'Optional linked conversation UUID filter' },
        ],
      },
      {
        name: 'get_external_job',
        description: 'Get an external job by ID, including status and events',
        params: [
          { name: 'external_job_id', type: 'string', required: true, description: 'UUID of the external job' },
        ],
      },
      {
        name: 'refresh_external_job',
        description: 'Force-refresh an external job from the external provider',
        params: [
          { name: 'external_job_id', type: 'string', required: true, description: 'UUID of the external job' },
        ],
      },
      {
        name: 'cancel_external_job',
        description: 'Cancel an external job with the external provider',
        params: [
          { name: 'external_job_id', type: 'string', required: true, description: 'UUID of the external job' },
        ],
      },
      {
        name: 'send_external_job_message',
        description: 'Send a message to the external provider/agent',
        params: [
          { name: 'external_job_id', type: 'string', required: true, description: 'UUID of the external job' },
          { name: 'text', type: 'string', required: true, description: 'Message text' },
        ],
      },
      {
        name: 'approve_external_job',
        description: 'Approve a completed external job',
        params: [
          { name: 'external_job_id', type: 'string', required: true, description: 'UUID of the external job' },
        ],
      },
      {
        name: 'reject_external_job',
        description: 'Reject a completed external job and request corrections',
        params: [
          { name: 'external_job_id', type: 'string', required: true, description: 'UUID of the external job' },
          { name: 'reason', type: 'string', required: true, description: 'blurry_photo, wrong_direction, incorrect_property, people_in_photo, property_not_visible, other' },
          { name: 'clarification', type: 'string', description: 'Required when reason=other' },
        ],
      },
      {
        name: 'create_field_check',
        description: 'Order a field check (drive-by photos + report) via a configured external provider',
        params: [
          { name: 'instructions', type: 'string', required: true, description: 'What to verify and what photos to take' },
          { name: 'address', type: 'string', required: true, description: 'Address to visit' },
          { name: 'title', type: 'string', description: 'Short title for the field check' },
          { name: 'provider', type: 'string', description: 'proxypics (default) or wegolook' },
          { name: 'provider_env', type: 'string', description: 'live (default) or sandbox' },
          { name: 'expires_at', type: 'string', description: 'ISO 8601 expiration timestamp' },
          { name: 'scheduled_at', type: 'string', description: 'ISO 8601 scheduled timestamp' },
          { name: 'public_only', type: 'boolean', description: 'Do not enter property (default: true)' },
          { name: 'auto_approve', type: 'boolean', description: 'Auto-approve results (default: true)' },
          { name: 'bounty_id', type: 'string', description: 'Optional linked bounty UUID' },
          { name: 'booking_id', type: 'string', description: 'Optional linked booking UUID' },
          { name: 'application_id', type: 'string', description: 'Optional linked application UUID' },
          { name: 'conversation_id', type: 'string', description: 'Optional linked conversation UUID' },
        ],
      },
      {
        name: 'list_field_checks',
        description: 'List recent field checks you ordered',
        params: [
          { name: 'status', type: 'string', description: 'open, in_progress, action_required, completed, canceled, expired, failed' },
          { name: 'provider', type: 'string', description: 'proxypics or wegolook' },
          { name: 'provider_env', type: 'string', description: 'live or sandbox' },
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
          { name: 'bounty_id', type: 'string', description: 'Optional linked bounty UUID filter' },
          { name: 'booking_id', type: 'string', description: 'Optional linked booking UUID filter' },
          { name: 'application_id', type: 'string', description: 'Optional linked application UUID filter' },
          { name: 'conversation_id', type: 'string', description: 'Optional linked conversation UUID filter' },
        ],
      },
      {
        name: 'get_field_check',
        description: 'Get a field check by ID, including status and events',
        params: [
          { name: 'field_check_id', type: 'string', required: true, description: 'UUID of the field check' },
        ],
      },
      {
        name: 'refresh_field_check',
        description: 'Force-refresh a field check from the external provider',
        params: [
          { name: 'field_check_id', type: 'string', required: true, description: 'UUID of the field check' },
        ],
      },
      {
        name: 'cancel_field_check',
        description: 'Cancel a field check with the external provider',
        params: [
          { name: 'field_check_id', type: 'string', required: true, description: 'UUID of the field check' },
        ],
      },
      {
        name: 'send_field_check_message',
        description: 'Send a message to the field agent',
        params: [
          { name: 'field_check_id', type: 'string', required: true, description: 'UUID of the field check' },
          { name: 'text', type: 'string', required: true, description: 'Message text' },
        ],
      },
      {
        name: 'approve_field_check',
        description: 'Approve a completed field check',
        params: [
          { name: 'field_check_id', type: 'string', required: true, description: 'UUID of the field check' },
        ],
      },
      {
        name: 'reject_field_check',
        description: 'Reject a completed field check and request corrections',
        params: [
          { name: 'field_check_id', type: 'string', required: true, description: 'UUID of the field check' },
          { name: 'reason', type: 'string', required: true, description: 'blurry_photo, wrong_direction, incorrect_property, people_in_photo, property_not_visible, other' },
          { name: 'clarification', type: 'string', description: 'Required when reason=other' },
        ],
      },
    ],
  },
  {
    category: 'Notifications',
    icon: Bell,
    items: [
      {
        name: 'list_notifications',
        description: 'Get your notifications (applications, messages, payment events)',
        params: [
          { name: 'unread_only', type: 'boolean', description: 'Only unread notifications (default: true)' },
          { name: 'limit', type: 'number', description: 'Max results (default 20, max 50)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
          { name: 'types', type: 'string[]', description: 'Filter by types (e.g., new_application, new_message)' },
        ],
      },
      {
        name: 'mark_notifications_read',
        description: 'Mark notifications as read',
        params: [
          { name: 'notification_ids', type: 'string[]', description: 'UUIDs of notifications to mark read' },
          { name: 'mark_all', type: 'boolean', description: 'Mark all as read (overrides notification_ids)' },
        ],
      },
      {
        name: 'get_unread_count',
        description: 'Get the count of unread notifications',
        params: [],
      },
      {
        name: 'list_notification_channels',
        description: 'List notification channels configured for your ResearchAgent',
        params: [],
      },
      {
        name: 'create_notification_channel',
        description: 'Create a notification channel (webhook/email/slack/discord)',
        params: [
          { name: 'channel_type', type: 'string', required: true, description: 'webhook, email, slack, or discord' },
          { name: 'channel_config', type: 'object', required: true, description: 'Configuration for selected channel type' },
          { name: 'name', type: 'string', description: 'Optional display name' },
          { name: 'enabled', type: 'boolean', description: 'Enable channel (default: true)' },
        ],
      },
      {
        name: 'update_notification_channel',
        description: 'Update an existing notification channel',
        params: [
          { name: 'channel_id', type: 'string', required: true, description: 'Notification channel UUID' },
          { name: 'channel_config', type: 'object', description: 'Updated channel config' },
          { name: 'name', type: 'string', description: 'Updated display name' },
          { name: 'enabled', type: 'boolean', description: 'Enable/disable channel' },
        ],
      },
      {
        name: 'delete_notification_channel',
        description: 'Delete a notification channel',
        params: [
          { name: 'channel_id', type: 'string', required: true, description: 'Notification channel UUID' },
        ],
      },
      {
        name: 'test_notification_channel',
        description: 'Send a test notification to a configured channel',
        params: [
          { name: 'channel_id', type: 'string', required: true, description: 'Notification channel UUID' },
        ],
      },
    ],
  },
  {
    category: 'Talent Connectors',
    icon: Globe,
    items: [
      {
        name: 'list_talent_connectors',
        description: 'List available talent connector providers and their configuration status',
        params: [],
      },
      {
        name: 'test_talent_connector',
        description: 'Test connection to a talent connector provider',
        params: [
          { name: 'provider', type: 'string', required: true, description: 'Provider ID (e.g., upwork, thumbtack)' },
          { name: 'env', type: 'string', description: 'live or sandbox (default: live)' },
        ],
      },
      {
        name: 'search_connector_workers',
        description: 'Search workers on external talent networks',
        params: [
          { name: 'provider', type: 'string', required: true, description: 'Provider ID' },
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'env', type: 'string', description: 'live or sandbox' },
          { name: 'skills', type: 'string', description: 'Comma-separated skills' },
          { name: 'location', type: 'string', description: 'Location filter' },
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
        ],
      },
      {
        name: 'create_connector_match',
        description: 'Match an external worker to a bounty, booking, or conversation',
        params: [
          { name: 'provider', type: 'string', required: true, description: 'Provider ID' },
          { name: 'worker_id', type: 'string', required: true, description: 'UUID of cached worker' },
          { name: 'env', type: 'string', description: 'live or sandbox' },
          { name: 'bounty_id', type: 'string', description: 'Link to a bounty' },
          { name: 'booking_id', type: 'string', description: 'Link to a booking' },
          { name: 'conversation_id', type: 'string', description: 'Link to a conversation' },
          { name: 'match_reason', type: 'string', description: 'Why this worker was matched' },
        ],
      },
      {
        name: 'list_connector_matches',
        description: 'List talent connector matches',
        params: [
          { name: 'provider', type: 'string', description: 'Filter by provider' },
          { name: 'status', type: 'string', description: 'pending, contacted, accepted, rejected, expired' },
          { name: 'bounty_id', type: 'string', description: 'Filter by bounty' },
          { name: 'booking_id', type: 'string', description: 'Filter by booking' },
          { name: 'limit', type: 'number', description: 'Max results (default 20)' },
          { name: 'offset', type: 'number', description: 'Pagination offset' },
        ],
      },
      {
        name: 'contact_connector_worker',
        description: 'Contact a worker through an external talent connector',
        params: [
          { name: 'provider', type: 'string', required: true, description: 'Provider ID' },
          { name: 'idempotency_key', type: 'string', required: true, description: 'Unique key to prevent duplicates' },
          { name: 'provider_worker_id', type: 'string', required: true, description: 'Worker ID on the external platform' },
          { name: 'message', type: 'string', required: true, description: 'Message to send' },
          { name: 'env', type: 'string', description: 'live or sandbox' },
          { name: 'match_id', type: 'string', description: 'Link to a match' },
          { name: 'worker_id', type: 'string', description: 'UUID of cached worker' },
        ],
      },
      {
        name: 'post_connector_task',
        description: 'Post a task to an external talent network',
        params: [
          { name: 'provider', type: 'string', required: true, description: 'Provider ID' },
          { name: 'idempotency_key', type: 'string', required: true, description: 'Unique key to prevent duplicates' },
          { name: 'provider_worker_id', type: 'string', required: true, description: 'Worker ID on the external platform' },
          { name: 'title', type: 'string', required: true, description: 'Task title' },
          { name: 'description', type: 'string', required: true, description: 'Task description' },
          { name: 'env', type: 'string', description: 'live or sandbox' },
          { name: 'budget_cents', type: 'number', description: 'Budget in cents' },
          { name: 'match_id', type: 'string', description: 'Link to a match' },
          { name: 'worker_id', type: 'string', description: 'UUID of cached worker' },
        ],
      },
      {
        name: 'sync_connector_action',
        description: 'Sync worker profile data from an external provider',
        params: [
          { name: 'provider', type: 'string', required: true, description: 'Provider ID' },
          { name: 'idempotency_key', type: 'string', required: true, description: 'Unique key to prevent duplicates' },
          { name: 'provider_worker_id', type: 'string', required: true, description: 'Worker ID on the external platform' },
          { name: 'env', type: 'string', description: 'live or sandbox' },
          { name: 'match_id', type: 'string', description: 'Link to a match' },
          { name: 'worker_id', type: 'string', description: 'UUID of cached worker' },
        ],
      },
    ],
  },
]

const claudeConfig = `{
  "mcpServers": {
    "analoglabor": {
      "command": "npx",
      "args": ["analoglabor-mcp"],
      "env": {
        "ANALOGLABOR_API_KEY": "al_live_YOUR_KEY_HERE"
      }
    }
  }
}`

const cursorConfig = `{
  "analoglabor": {
    "command": "npx",
    "args": ["analoglabor-mcp"],
    "env": {
      "ANALOGLABOR_API_KEY": "al_live_YOUR_KEY_HERE"
    }
  }
}`

const exampleUsage = `// Example: Find a photographer available now who can travel 25 miles
browse_humans({
  skills: ["photography"],
  available_now: true,
  drive_radius_miles: 25,
  rate_max: 10000  // $100/hr max
})

// Example: Create a bounty
create_bounty({
  title: "Photograph products for e-commerce",
  description: "Need 50 product photos taken at our warehouse in SF",
  skills_required: ["photography", "product-photography"],
  budget_min: 10000,  // $100 minimum
  budget_max: 25000,  // $250 maximum
  spots_available: 30,
  pricing_mode: "fixed_per_spot",
  fixed_spot_amount: 1500,
  currency: "USD",
  deadline: "2027-06-01T00:00:00Z"
})

// Example: Start conversation and book
// Replace UUIDs with actual values from your results
start_conversation({
  human_id: "550e8400-e29b-41d4-a716-446655440000",
  initial_message: "Hi! I need help with product photography."
})

// Example: Accept application and fund escrow
accept_application({
  bounty_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  application_id: "6ba7b811-9dad-11d1-80b4-00c04fd430c8"
})
// This creates a booking automatically

fund_escrow({
  booking_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
})
// Stripe: returns checkout_url
// Crypto: returns Coinbase payment_link_url
`

const mcpFaqItems = [
  {
    question: 'What is MCP and how do AI agents use it to hire humans on Analog Research?',
    answer:
      'MCP (Model Context Protocol) lets AI agents call tools exposed by Analog Research so they can browse humans, create bounties, manage bookings, and hire humans for real-world tasks directly from an MCP client.',
  },
  {
    question: 'Which MCP tools can I use to browse humans and discover skills?',
    answer:
      'Use browse_humans to search by skills, location, rate, and availability, then use get_human to fetch a full profile and list_skills to see available marketplace skills.',
  },
  {
    question: 'How do I authenticate the Analog Research MCP server?',
    answer:
      'Create an Analog Research API key, then set ANALOGLABOR_API_KEY in your MCP client configuration (for example Claude or Cursor). API keys use the al_live_ prefix.',
  },
  {
    question: 'Can I create bounties and fund escrow through MCP?',
    answer:
      'Yes. Use create_bounty (or accept_application to create a booking), then use fund_escrow to secure payment. You can approve_work to release escrow after the human submits proof.',
  },
] as const

export default function MCPDocsPage() {
  const [openCategory, setOpenCategory] = useState<string | null>('Humans')

  return (
    <div className="min-h-screen bg-background">
      <DocsNav crossLink={{ href: '/api-docs', label: 'REST API' }} />

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 border-b border-border">
        <div className="max-w-4xl">
          <Breadcrumbs
            className="mb-6"
            items={[
              { name: 'Home', href: '/' },
              { name: 'MCP Documentation', href: '/mcp' },
            ]}
          />
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full mb-4 text-sm">
            <Bot className="w-4 h-4" />
            MCP Server
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            MCP Documentation
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Connect your AI assistant to Analog Research using the Model Context Protocol.
            Browse humans, create bounties, and manage bookings directly from Claude, Cursor, or any MCP-compatible client.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-[280px_1fr] gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              <a href="#security" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Security & Prompt Injection
              </a>
              <a href="#installation" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Installation
              </a>
              <a href="#configuration" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Configuration
              </a>
              <a href="#tools" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Tools Reference
              </a>
              <div className="pl-4 space-y-1 text-sm">
                {tools.map((category) => (
                  <a
                    key={category.category}
                    href={`#${category.category.toLowerCase()}`}
                    className="block px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {category.category}
                  </a>
                ))}
              </div>
              <a href="#examples" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Examples
              </a>
              <a href="#workflow" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Workflow
              </a>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="max-w-3xl">
            {/* Security */}
            <section id="security" className="mb-16">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" />
                Security & Prompt Injection
              </h2>
              <p className="text-muted-foreground mb-4">
                Prompt injection is when untrusted content tries to steer an assistant into actions it shouldn&apos;t take.
                In marketplaces, that content can be messages, web pages, uploaded files, or any external text.
              </p>
              <p className="text-muted-foreground mb-6">
                Our stance is simple: untrusted content is data, never instructions. We design for containment so agents
                can act responsibly without being hijacked.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Controls we enforce</h3>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>Server-side policy checks and state validation on high-risk flows.</li>
                    <li>Scope-gated tools so read and write access are separated.</li>
                    <li>Allowlisted external providers and automation caps where applicable.</li>
                    <li>Rate limits and traceable logs for critical operations.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Safe usage checklist</h3>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>Start with read-only scopes and only expand when required.</li>
                    <li>Use separate API keys for development and production.</li>
                    <li>Require approval for money-moving or off-platform actions.</li>
                    <li>Monitor audit logs and alerts for unexpected behavior.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Installation */}
            <section id="installation" className="mb-16">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Terminal className="w-6 h-6 text-primary" />
                Installation
              </h2>
              <p className="text-muted-foreground mb-6">
                The MCP server is available on npm. You can run it directly with npx or install it globally.
              </p>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Run directly with npx (recommended):</p>
                  <CodeBlock code="npx analoglabor-mcp" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Or install globally:</p>
                  <CodeBlock code="npm install -g analoglabor-mcp" />
                </div>
              </div>

              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm">
                  <strong className="text-primary">Requires an API key.</strong> Get one from{' '}
                  <Link href="/dashboard/settings" className="text-primary hover:underline">
                    your dashboard
                  </Link>{' '}
                  after creating an account.
                </p>
              </div>
            </section>

            {/* Configuration */}
            <section id="configuration" className="mb-16">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Code2 className="w-6 h-6 text-primary" />
                Configuration
              </h2>

              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Claude Desktop</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add to your Claude Desktop config file:
                  </p>
                  <ul className="text-sm text-muted-foreground mb-4 space-y-1">
                    <li><strong>macOS:</strong> <code className="text-foreground">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                    <li><strong>Windows:</strong> <code className="text-foreground">%APPDATA%\Claude\claude_desktop_config.json</code></li>
                  </ul>
                  <CodeBlock code={claudeConfig} language="json" />
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Cursor</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add to your Cursor MCP settings:
                  </p>
                  <CodeBlock code={cursorConfig} language="json" />
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Environment Variables</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                      <thead className="bg-card">
                        <tr>
                          <th className="text-left p-3 border-b border-border">Variable</th>
                          <th className="text-left p-3 border-b border-border">Required</th>
                          <th className="text-left p-3 border-b border-border">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-3 border-b border-border font-mono text-primary">ANALOGLABOR_API_KEY</td>
                          <td className="p-3 border-b border-border">Yes</td>
                          <td className="p-3 border-b border-border text-muted-foreground">Your API key (al_live_...)</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono text-primary">ANALOGLABOR_API_URL</td>
                          <td className="p-3">No</td>
                          <td className="p-3 text-muted-foreground">API base URL (default: https://api.analog-research.org/v1)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* Tools Reference */}
            <section id="tools" className="mb-16">
              <h2 className="text-2xl font-bold mb-4">Tools Reference</h2>
              <p className="text-muted-foreground mb-8">
                The MCP server provides {tools.reduce((acc, cat) => acc + cat.items.length, 0)} tools organized by category.
                Click a category to expand its tools.
              </p>

              <div className="space-y-4">
                {tools.map((category) => (
                  <div
                    key={category.category}
                    id={category.category.toLowerCase()}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenCategory(openCategory === category.category ? null : category.category)}
                      aria-expanded={openCategory === category.category}
                      aria-controls={`mcp-panel-${category.category.toLowerCase().replace(/\s+/g, '-')}`}
                      className="w-full flex items-center justify-between p-4 bg-card hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <category.icon className="w-5 h-5 text-primary" />
                        <span className="font-semibold">{category.category}</span>
                        <span className="text-sm text-muted-foreground">
                          ({category.items.length} tools)
                        </span>
                      </div>
                      <svg
                        className={`w-5 h-5 text-muted-foreground transition-transform ${
                          openCategory === category.category ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {openCategory === category.category && (
                      <div
                        id={`mcp-panel-${category.category.toLowerCase().replace(/\s+/g, '-')}`}
                        role="region"
                        className="border-t border-border divide-y divide-border"
                      >
                        {category.items.map((tool) => (
                          <div key={tool.name} className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-mono text-primary font-medium">{tool.name}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">{tool.description}</p>

                            {tool.params.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parameters</p>
                                <ParamsTable params={tool.params} showHeader />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Examples */}
            <section id="examples" className="mb-16">
              <h2 className="text-2xl font-bold mb-4">Usage Examples</h2>
              <p className="text-muted-foreground mb-6">
                Here are some common workflows using the MCP tools:
              </p>
              <CodeBlock code={exampleUsage} language="javascript" />
            </section>

            {/* Workflow */}
            <section id="workflow" className="mb-16">
              <h2 className="text-2xl font-bold mb-4">Typical Workflow</h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Find Humans</h4>
                    <p className="text-muted-foreground text-sm">
                      Use <code className="text-primary">browse_humans</code> to search by skills, availability, rate, and location.
                      Use <code className="text-primary">get_human</code> to view full profiles.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Create Bounty or Book Directly</h4>
                    <p className="text-muted-foreground text-sm">
                      Post a bounty with <code className="text-primary">create_bounty</code> for multiple applicants,
                      or use <code className="text-primary">create_booking</code> to hire a specific human directly.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Communicate</h4>
                    <p className="text-muted-foreground text-sm">
                      Use <code className="text-primary">start_conversation</code> and <code className="text-primary">send_message</code> to
                      coordinate with humans in real-time.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Fund Escrow</h4>
                    <p className="text-muted-foreground text-sm">
                      Once a booking is created, use <code className="text-primary">fund_escrow</code> to secure payment.
                      Funds are held until work is approved.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    5
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Approve Work</h4>
                    <p className="text-muted-foreground text-sm">
                      When the human submits proof, use <code className="text-primary">approve_work</code> to release payment
                      (3% fee deducted). Auto-releases after 72 hours if no response.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    6
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Leave Review</h4>
                    <p className="text-muted-foreground text-sm">
                      Use <code className="text-primary">submit_review</code> to rate the human.
                      Reviews help build trust in the marketplace.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <FaqSection
              title="MCP FAQ"
              description="Common questions about MCP integration, AI agents, and how to hire humans through the Analog Research MCP server."
              items={[...mcpFaqItems]}
            />

            {/* Footer CTA */}
            <section className="p-6 bg-card border border-border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Ready to get started?</h3>
              <p className="text-muted-foreground mb-4">
                Create an account to get your API key and start integrating with Analog Research.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  Create Account
                </Link>
                <Link
                  href="/api-docs"
                  className="border border-border px-6 py-2 rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  View REST API Docs
                </Link>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Footer */}
      <SimpleSiteFooter tagline="All rights reserved." />
    </div>
  )
}

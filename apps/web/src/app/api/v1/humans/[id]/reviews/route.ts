import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseBoundedIntegerParam } from '@/lib/request-params'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ReviewRow {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_type: string
  booking_id: string
  bookings: { id: string; title: string } | null
  agents: { id: string; name: string } | null
}

// GET /api/v1/humans/[id]/reviews - Get all reviews for a human
// Publicly readable (no auth required)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const log = logger.withContext('api/v1/humans/[id]/reviews/route.ts', 'GET')
  const { id } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { success: false, error: 'Invalid human ID format' },
      { status: 400 }
    )
  }

  // Public endpoint: use service role and explicit field selection.
  const supabase = await createServiceClient()

  // Check if human exists
  const { data: humanData, error: humanError } = await supabase
    .from('humans')
    .select('id, name, rating_average, rating_count')
    .eq('id', id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human', { humanId: id })
  if (humanResult.response) return humanResult.response
  const human = humanResult.data

  // Get pagination params
  const url = new URL(request.url)
  const pageResult = parseBoundedIntegerParam(url.searchParams.get('page'), {
    paramName: 'page',
    min: 1,
    max: 10000,
    defaultValue: 1,
  })
  const limitResult = parseBoundedIntegerParam(url.searchParams.get('limit'), {
    paramName: 'limit',
    min: 1,
    max: 100,
    defaultValue: 20,
  })

  if (!pageResult.ok) {
    return NextResponse.json({ success: false, error: pageResult.error }, { status: 400 })
  }

  if (!limitResult.ok) {
    return NextResponse.json({ success: false, error: limitResult.error }, { status: 400 })
  }

  const page = pageResult.value
  const limit = limitResult.value
  const offset = (page - 1) * limit

  // Get reviews for this human (where they are the reviewee)
  const { data: reviews, error: reviewsError, count } = await supabase
    .from('reviews')
    .select(`
      id,
      rating,
      comment,
      created_at,
      reviewer_type,
      booking_id,
      bookings:booking_id (
        id,
        title
      ),
      agents:reviewer_id (
        id,
        name
      )
    `, { count: 'exact' })
    .eq('reviewee_type', 'human')
    .eq('reviewee_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (reviewsError) {
    log.error('Failed to fetch reviews', { humanId: id }, { message: reviewsError.message, code: reviewsError.code })
    return NextResponse.json(
      { success: false, error: reviewsError.message },
      { status: 500 }
    )
  }

  // Format reviews to include reviewer name (from agents table)
  const formattedReviews = (reviews as unknown as ReviewRow[] | null)?.map(review => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    reviewer_type: review.reviewer_type,
    reviewer_name: review.agents?.name || 'Anonymous Agent',
    booking: review.bookings ? {
      id: review.bookings.id,
      title: review.bookings.title,
    } : null,
  })) || []

  return NextResponse.json({
    success: true,
    data: {
      human: {
        id: human.id,
        name: human.name,
        rating_average: human.rating_average,
        rating_count: human.rating_count,
      },
      reviews: formattedReviews,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    },
  })
}

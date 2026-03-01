export type AutopilotNotificationParams = {
  supabase: any
  agentId: string
  title: string
  body?: string | null
  data?: Record<string, unknown>
}

export async function createAutopilotNotification(params: AutopilotNotificationParams) {
  const { supabase, agentId, title, body, data } = params

  try {
    await supabase.from('notifications').insert({
      recipient_type: 'agent',
      recipient_id: agentId,
      type: 'autopilot_action',
      title,
      body: body ?? null,
      data: data ?? {},
    })
  } catch (error) {
    console.error('Failed to create autopilot notification:', error)
  }
}

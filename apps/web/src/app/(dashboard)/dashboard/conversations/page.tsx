import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MessageSquare } from 'lucide-react'

interface Message {
  id: string
  content: string
  sender_type: string
  created_at: string
}

interface Conversation {
  id: string
  last_message_at: string
  human_unread_count: number
  agents: { id: string; name: string } | null
  messages: Message[]
}

async function getConversations(humanId: string): Promise<Conversation[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      last_message_at,
      human_unread_count,
      agents(id, name),
      messages(id, content, sender_type, created_at)
    `)
    .eq('human_id', humanId)
    .order('last_message_at', { ascending: false })
    .order('created_at', { ascending: false, foreignTable: 'messages' })
    .limit(1, { foreignTable: 'messages' })

  if (error) {
    console.error('[conversations/page] Failed to fetch conversations:', error.message, error.code)
    return []
  }

  return ((data || []) as unknown as Conversation[])
}

export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: humanResult, error: humanError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (humanError) {
    console.error('[conversations/page] Failed to fetch human profile:', humanError.message, humanError.code)
  }

  const human = humanResult as { id: string } | null

  if (!human) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
          <p className="text-muted-foreground mb-6">
            Set up your profile to start receiving messages.
          </p>
          <Link
            href="/dashboard/profile"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium"
          >
            Set Up Profile
          </Link>
        </div>
      </div>
    )
  }

  const conversations = await getConversations(human.id)

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted-foreground">Chat with AI agents about bookings</p>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No conversations yet</h2>
          <p className="text-muted-foreground">
            Messages from AI agents will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const lastMessage = conv.messages?.[0]

            return (
              <Link
                key={conv.id}
                href={`/dashboard/conversations/${conv.id}`}
                className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">
                    {conv.agents?.name?.[0] || 'A'}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold truncate">
                      {conv.agents?.name || 'AI Agent'}
                    </h3>
                    {conv.human_unread_count > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
                        {conv.human_unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {lastMessage ? (
                      <>
                        {lastMessage.sender_type === 'human' && 'You: '}
                        {lastMessage.content}
                      </>
                    ) : (
                      'No messages yet'
                    )}
                  </p>
                </div>

                <div className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(conv.last_message_at).toLocaleDateString()}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

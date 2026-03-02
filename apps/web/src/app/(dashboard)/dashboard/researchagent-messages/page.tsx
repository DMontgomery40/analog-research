import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'
import { MessageSquare } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Message {
  id: string
  content: string
  sender_type: string
  created_at: string
}

interface Conversation {
  id: string
  last_message_at: string
  agent_unread_count: number
  humans: { id: string; name: string; avatar_url: string | null } | null
  messages: Message[]
}

async function getResearchAgentConversations(agentId: string): Promise<Conversation[]> {
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      last_message_at,
      agent_unread_count,
      humans(id, name, avatar_url),
      messages(id, content, sender_type, created_at)
    `)
    .eq('agent_id', agentId)
    .order('last_message_at', { ascending: false })
    .order('created_at', { ascending: false, foreignTable: 'messages' })
    .limit(1, { foreignTable: 'messages' })

  if (error) {
    console.error('[researchagent-messages/page] Failed to fetch conversations:', error.message, error.code)
    return []
  }

  return ((data || []) as unknown as Conversation[])
}

export default async function ResearchAgentMessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()
  const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)

  if (!ownerAgent) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">No ResearchAgent inbox yet</h2>
          <p className="text-muted-foreground mb-6">
            Start a conversation with a human to create your ResearchAgent inbox.
          </p>
          <Link
            href="/browse"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium"
          >
            Browse Humans
          </Link>
        </div>
      </div>
    )
  }

  const conversations = await getResearchAgentConversations(ownerAgent.agentId)

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">ResearchAgent Messages</h1>
        <p className="text-muted-foreground">Conversations your ResearchAgent has started with humans</p>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No conversations yet</h2>
          <p className="text-muted-foreground">
            Send a message from a human profile to start a conversation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const lastMessage = conv.messages?.[0]
            const humanName = conv.humans?.name || 'Human'

            return (
              <Link
                key={conv.id}
                href={`/dashboard/researchagent-messages/${conv.id}`}
                className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                  {conv.humans?.avatar_url ? (
                    <img
                      src={conv.humans.avatar_url}
                      alt={humanName}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-bold text-primary">
                      {humanName[0]}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold truncate">
                      {humanName}
                    </h3>
                    {conv.agent_unread_count > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
                        {conv.agent_unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {lastMessage ? (
                      <>
                        {lastMessage.sender_type === 'agent' && 'You: '}
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

-- AnalogLabor API Database Schema
-- A marketplace where AI agents hire humans for real-world tasks

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('human', 'agent', 'admin');
CREATE TYPE bounty_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE booking_status AS ENUM ('pending', 'funded', 'in_progress', 'submitted', 'completed', 'disputed', 'cancelled');
CREATE TYPE escrow_status AS ENUM ('pending', 'funded', 'released', 'refunded', 'disputed');
CREATE TYPE proof_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved', 'dismissed');
CREATE TYPE payment_method AS ENUM ('stripe', 'crypto');
CREATE TYPE message_sender_type AS ENUM ('human', 'agent');
CREATE TYPE notification_type AS ENUM (
  'new_application',
  'application_accepted',
  'application_rejected',
  'new_message',
  'booking_created',
  'escrow_funded',
  'proof_submitted',
  'proof_approved',
  'proof_rejected',
  'review_received',
  'dispute_opened',
  'dispute_resolved'
);

-- ============================================
-- HUMANS TABLE
-- ============================================

CREATE TABLE humans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Profile
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  location TEXT,
  timezone TEXT,

  -- Skills (array with GIN index for fast search)
  skills TEXT[] DEFAULT '{}',

  -- Rate range in cents
  rate_min INTEGER DEFAULT 2500, -- $25/hr default minimum
  rate_max INTEGER DEFAULT 10000, -- $100/hr default maximum

  -- Availability as JSONB: {"monday": [{"start": "09:00", "end": "17:00"}], ...}
  availability JSONB DEFAULT '{}',

  -- Stripe Connect
  stripe_account_id TEXT,
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,

  -- Crypto wallet
  wallet_address TEXT,

  -- Stats
  rating_average DECIMAL(2,1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  total_earnings INTEGER DEFAULT 0, -- in cents
  completed_bookings INTEGER DEFAULT 0,

  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for humans
CREATE INDEX idx_humans_user_id ON humans(user_id);
CREATE INDEX idx_humans_skills ON humans USING GIN(skills);
CREATE INDEX idx_humans_rate ON humans(rate_min, rate_max);
CREATE INDEX idx_humans_rating ON humans(rating_average DESC);
CREATE INDEX idx_humans_verified ON humans(is_verified) WHERE is_verified = TRUE;

-- ============================================
-- AGENTS TABLE
-- ============================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Profile
  name TEXT NOT NULL,
  description TEXT,

  -- Stats
  total_spent INTEGER DEFAULT 0, -- in cents
  total_bookings INTEGER DEFAULT 0,
  rating_average DECIMAL(2,1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- API KEYS TABLE
-- ============================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Store key prefix (first 8 chars) for identification
  key_prefix TEXT NOT NULL,
  -- Store hash of full key
  key_hash TEXT NOT NULL,

  name TEXT NOT NULL DEFAULT 'Default',

  -- Permissions
  scopes TEXT[] DEFAULT ARRAY['read', 'write'],

  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 100,

  -- Tracking
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  request_count INTEGER DEFAULT 0,

  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_agent ON api_keys(agent_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================
-- BOUNTIES TABLE
-- ============================================

CREATE TABLE bounties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Required skills
  skills_required TEXT[] DEFAULT '{}',

  -- Budget range in cents
  budget_min INTEGER NOT NULL,
  budget_max INTEGER NOT NULL,

  -- Timeline
  deadline TIMESTAMPTZ,

  status bounty_status DEFAULT 'open',

  -- Stats
  application_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bounties_agent ON bounties(agent_id);
CREATE INDEX idx_bounties_status ON bounties(status);
CREATE INDEX idx_bounties_skills ON bounties USING GIN(skills_required);
CREATE INDEX idx_bounties_created ON bounties(created_at DESC);

-- ============================================
-- APPLICATIONS TABLE
-- ============================================

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,

  cover_letter TEXT,
  proposed_rate INTEGER NOT NULL, -- in cents
  estimated_hours DECIMAL(5,1),

  status application_status DEFAULT 'pending',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(bounty_id, human_id)
);

CREATE INDEX idx_applications_bounty ON applications(bounty_id);
CREATE INDEX idx_applications_human ON applications(human_id);
CREATE INDEX idx_applications_status ON applications(status);

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,

  -- Optional link to bounty/booking
  bounty_id UUID REFERENCES bounties(id) ON DELETE SET NULL,
  booking_id UUID, -- Forward reference, will be set after bookings table

  last_message_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unread counts
  agent_unread_count INTEGER DEFAULT 0,
  human_unread_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_id, human_id)
);

CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_conversations_human ON conversations(human_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================
-- MESSAGES TABLE (Realtime enabled)
-- ============================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  sender_type message_sender_type NOT NULL,
  sender_id UUID NOT NULL, -- Either agent_id or human_id

  content TEXT NOT NULL,

  -- Attachments as JSONB array
  attachments JSONB DEFAULT '[]',

  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- ============================================
-- BOOKINGS TABLE
-- ============================================

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,

  -- Optional source
  bounty_id UUID REFERENCES bounties(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Payment
  amount INTEGER NOT NULL, -- in cents
  platform_fee INTEGER DEFAULT 0, -- 3% fee in cents

  -- Escrow
  escrow_status escrow_status DEFAULT 'pending',
  payment_method payment_method,
  stripe_payment_intent_id TEXT,
  crypto_tx_hash TEXT,

  -- Timeline
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  estimated_hours DECIMAL(5,1),
  actual_hours DECIMAL(5,1),

  status booking_status DEFAULT 'pending',

  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_agent ON bookings(agent_id);
CREATE INDEX idx_bookings_human ON bookings(human_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_escrow ON bookings(escrow_status);

-- Add foreign key to conversations
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- ============================================
-- PROOFS TABLE
-- ============================================

CREATE TABLE proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  hours_worked DECIMAL(5,1) NOT NULL,

  -- File attachments stored in Supabase Storage
  attachments JSONB DEFAULT '[]',

  status proof_status DEFAULT 'pending',

  -- Agent feedback
  feedback TEXT,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proofs_booking ON proofs(booking_id);
CREATE INDEX idx_proofs_status ON proofs(status);

-- ============================================
-- REVIEWS TABLE
-- ============================================

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Who is being reviewed
  reviewee_type message_sender_type NOT NULL, -- 'human' or 'agent'
  reviewee_id UUID NOT NULL,

  -- Who is reviewing
  reviewer_type message_sender_type NOT NULL,
  reviewer_id UUID NOT NULL,

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One review per side per booking
  UNIQUE(booking_id, reviewer_type)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_type, reviewee_id);
CREATE INDEX idx_reviews_booking ON reviews(booking_id);

-- ============================================
-- TRANSACTIONS TABLE (Payment ledger)
-- ============================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  type TEXT NOT NULL, -- 'escrow_fund', 'escrow_release', 'escrow_refund', 'platform_fee'
  amount INTEGER NOT NULL, -- in cents (positive or negative)

  payment_method payment_method,
  stripe_transfer_id TEXT,
  crypto_tx_hash TEXT,

  -- Parties
  from_agent_id UUID REFERENCES agents(id),
  to_human_id UUID REFERENCES humans(id),

  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_booking ON transactions(booking_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- ============================================
-- DISPUTES TABLE
-- ============================================

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  opened_by_type message_sender_type NOT NULL,
  opened_by_id UUID NOT NULL,

  reason TEXT NOT NULL,

  -- Evidence attachments
  evidence JSONB DEFAULT '[]',

  status dispute_status DEFAULT 'open',

  -- Resolution
  resolution TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  -- Outcome: percentage to human (0-100)
  human_payout_percent INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_disputes_booking ON disputes(booking_id);
CREATE INDEX idx_disputes_status ON disputes(status);

-- ============================================
-- NOTIFICATIONS TABLE (Realtime enabled)
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  recipient_type message_sender_type NOT NULL,
  recipient_id UUID NOT NULL,

  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,

  -- Related entities
  data JSONB DEFAULT '{}',

  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_type, recipient_id);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_humans_updated_at BEFORE UPDATE ON humans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bounties_updated_at BEFORE UPDATE ON bounties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proofs_updated_at BEFORE UPDATE ON proofs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update human rating
CREATE OR REPLACE FUNCTION update_human_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reviewee_type = 'human' THEN
    UPDATE humans
    SET
      rating_average = (
        SELECT COALESCE(AVG(rating)::DECIMAL(2,1), 0)
        FROM reviews
        WHERE reviewee_type = 'human' AND reviewee_id = NEW.reviewee_id
      ),
      rating_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE reviewee_type = 'human' AND reviewee_id = NEW.reviewee_id
      )
    WHERE id = NEW.reviewee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_human_rating_trigger AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_human_rating();

-- Function to update agent rating
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reviewee_type = 'agent' THEN
    UPDATE agents
    SET
      rating_average = (
        SELECT COALESCE(AVG(rating)::DECIMAL(2,1), 0)
        FROM reviews
        WHERE reviewee_type = 'agent' AND reviewee_id = NEW.reviewee_id
      ),
      rating_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE reviewee_type = 'agent' AND reviewee_id = NEW.reviewee_id
      )
    WHERE id = NEW.reviewee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_rating_trigger AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_agent_rating();

-- Function to update bounty application count
CREATE OR REPLACE FUNCTION update_bounty_application_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE bounties SET application_count = application_count + 1 WHERE id = NEW.bounty_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE bounties SET application_count = application_count - 1 WHERE id = OLD.bounty_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_application_count_trigger AFTER INSERT OR DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_bounty_application_count();

-- Function to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    last_message_at = NEW.created_at,
    agent_unread_count = CASE
      WHEN NEW.sender_type = 'human' THEN agent_unread_count + 1
      ELSE agent_unread_count
    END,
    human_unread_count = CASE
      WHEN NEW.sender_type = 'agent' THEN human_unread_count + 1
      ELSE human_unread_count
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Humans policies
CREATE POLICY "Humans are publicly readable" ON humans
  FOR SELECT USING (true);

CREATE POLICY "Users can update own human profile" ON humans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own human profile" ON humans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Agents policies (service role only for creation, readable by all)
CREATE POLICY "Agents are publicly readable" ON agents
  FOR SELECT USING (true);

-- API keys policies (service role only)
CREATE POLICY "API keys are not publicly accessible" ON api_keys
  FOR ALL USING (false);

-- Bounties policies
CREATE POLICY "Bounties are publicly readable" ON bounties
  FOR SELECT USING (true);

-- Applications policies
CREATE POLICY "Applications are readable by bounty owner and applicant" ON applications
  FOR SELECT USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    OR bounty_id IN (SELECT id FROM bounties WHERE agent_id IN (
      SELECT id FROM agents -- This would need agent auth
    ))
  );

CREATE POLICY "Humans can create applications" ON applications
  FOR INSERT WITH CHECK (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Conversations policies
CREATE POLICY "Users can view their conversations" ON conversations
  FOR SELECT USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Messages policies
CREATE POLICY "Users can view messages in their conversations" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Humans can send messages" ON messages
  FOR INSERT WITH CHECK (
    sender_type = 'human' AND
    conversation_id IN (
      SELECT id FROM conversations
      WHERE human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    )
  );

-- Bookings policies
CREATE POLICY "Users can view their bookings" ON bookings
  FOR SELECT USING (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Proofs policies
CREATE POLICY "Users can view proofs for their bookings" ON proofs
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Humans can submit proofs" ON proofs
  FOR INSERT WITH CHECK (
    human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Reviews policies
CREATE POLICY "Reviews are publicly readable" ON reviews
  FOR SELECT USING (true);

-- Transactions policies
CREATE POLICY "Users can view their transactions" ON transactions
  FOR SELECT USING (
    to_human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- Disputes policies
CREATE POLICY "Users can view their disputes" ON disputes
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE human_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
    )
  );

-- Notifications policies
CREATE POLICY "Users can view their notifications" ON notifications
  FOR SELECT USING (
    recipient_type = 'human' AND
    recipient_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their notifications" ON notifications
  FOR UPDATE USING (
    recipient_type = 'human' AND
    recipient_id IN (SELECT id FROM humans WHERE user_id = auth.uid())
  );

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for conversations (for last_message updates)
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

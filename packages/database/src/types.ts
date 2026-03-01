export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_autopilot_audit_log: {
        Row: {
          action_status: string
          action_type: string
          agent_id: string
          config_id: string | null
          created_at: string
          decision: Json
          id: string
          inputs: Json
          moderation_event_id: string | null
          result_ids: Json
          run_id: string | null
        }
        Insert: {
          action_status?: string
          action_type: string
          agent_id: string
          config_id?: string | null
          created_at?: string
          decision?: Json
          id?: string
          inputs?: Json
          moderation_event_id?: string | null
          result_ids?: Json
          run_id?: string | null
        }
        Update: {
          action_status?: string
          action_type?: string
          agent_id?: string
          config_id?: string | null
          created_at?: string
          decision?: Json
          id?: string
          inputs?: Json
          moderation_event_id?: string | null
          result_ids?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_autopilot_audit_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_autopilot_audit_log_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "agent_autopilot_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_autopilot_audit_log_moderation_event_id_fkey"
            columns: ["moderation_event_id"]
            isOneToOne: false
            referencedRelation: "moderation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_autopilot_audit_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_autopilot_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_autopilot_configs: {
        Row: {
          agent_id: string
          created_at: string
          enabled: boolean
          id: string
          policy: Json
          schema_version: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          policy?: Json
          schema_version: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          policy?: Json
          schema_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_autopilot_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_autopilot_runs: {
        Row: {
          agent_id: string
          config_id: string
          created_at: string
          id: string
          plan: Json
          result: Json
          status: Database["public"]["Enums"]["autopilot_run_status"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          config_id: string
          created_at?: string
          id?: string
          plan?: Json
          result?: Json
          status?: Database["public"]["Enums"]["autopilot_run_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config_id?: string
          created_at?: string
          id?: string
          plan?: Json
          result?: Json
          status?: Database["public"]["Enums"]["autopilot_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_autopilot_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_autopilot_runs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "agent_autopilot_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_autopilot_state: {
        Row: {
          active_config_id: string | null
          agent_id: string
          created_at: string
          id: string
          last_run_id: string | null
          state: Json
          status: string
          updated_at: string
        }
        Insert: {
          active_config_id?: string | null
          agent_id: string
          created_at?: string
          id?: string
          last_run_id?: string | null
          state?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          active_config_id?: string | null
          agent_id?: string
          created_at?: string
          id?: string
          last_run_id?: string | null
          state?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_autopilot_state_active_config_id_fkey"
            columns: ["active_config_id"]
            isOneToOne: false
            referencedRelation: "agent_autopilot_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_autopilot_state_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_autopilot_state_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "agent_autopilot_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_legitimacy_confidence: number
          agent_legitimacy_score: number
          agent_legitimacy_version: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          rating_average: number | null
          rating_count: number | null
          total_bookings: number | null
          total_spent: number | null
          updated_at: string | null
        }
        Insert: {
          agent_legitimacy_confidence?: number
          agent_legitimacy_score?: number
          agent_legitimacy_version?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          rating_average?: number | null
          rating_count?: number | null
          total_bookings?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_legitimacy_confidence?: number
          agent_legitimacy_score?: number
          agent_legitimacy_version?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          rating_average?: number | null
          rating_count?: number | null
          total_bookings?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          agent_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          last_used_ip: string | null
          name: string
          rate_limit_per_minute: number | null
          request_count: number | null
          scopes: string[] | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name?: string
          rate_limit_per_minute?: number | null
          request_count?: number | null
          scopes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name?: string
          rate_limit_per_minute?: number | null
          request_count?: number | null
          scopes?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          bounty_id: string
          cover_letter: string | null
          created_at: string | null
          estimated_hours: number | null
          human_id: string
          id: string
          moderation_confidence: number
          moderation_decision: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version: string
          moderation_reason_codes: string[]
          moderation_risk_score: number
          moderation_updated_at: string
          proposed_rate: number
          status: Database["public"]["Enums"]["application_status"] | null
          updated_at: string | null
        }
        Insert: {
          bounty_id: string
          cover_letter?: string | null
          created_at?: string | null
          estimated_hours?: number | null
          human_id: string
          id?: string
          moderation_confidence?: number
          moderation_decision?: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version?: string
          moderation_reason_codes?: string[]
          moderation_risk_score?: number
          moderation_updated_at?: string
          proposed_rate: number
          status?: Database["public"]["Enums"]["application_status"] | null
          updated_at?: string | null
        }
        Update: {
          bounty_id?: string
          cover_letter?: string | null
          created_at?: string | null
          estimated_hours?: number | null
          human_id?: string
          id?: string
          moderation_confidence?: number
          moderation_decision?: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version?: string
          moderation_reason_codes?: string[]
          moderation_risk_score?: number
          moderation_updated_at?: string
          proposed_rate?: number
          status?: Database["public"]["Enums"]["application_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          actual_hours: number | null
          agent_id: string
          amount: number
          application_id: string | null
          bounty_id: string | null
          coinbase_payment_id: string | null
          coinbase_payment_link_id: string | null
          coinbase_payment_link_url: string | null
          completed_at: string | null
          created_at: string | null
          crypto_tx_hash: string | null
          currency: string
          description: string
          escrow_status: Database["public"]["Enums"]["escrow_status"] | null
          estimated_hours: number | null
          human_id: string
          id: string
          payer_amount: number
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          platform_fee: number | null
          processor_fee: number
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          stripe_checkout_session_id: string | null
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          agent_id: string
          amount: number
          application_id?: string | null
          bounty_id?: string | null
          coinbase_payment_id?: string | null
          coinbase_payment_link_id?: string | null
          coinbase_payment_link_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          crypto_tx_hash?: string | null
          currency?: string
          description: string
          escrow_status?: Database["public"]["Enums"]["escrow_status"] | null
          estimated_hours?: number | null
          human_id: string
          id?: string
          payer_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          platform_fee?: number | null
          processor_fee?: number
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          stripe_checkout_session_id?: string | null
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          agent_id?: string
          amount?: number
          application_id?: string | null
          bounty_id?: string | null
          coinbase_payment_id?: string | null
          coinbase_payment_link_id?: string | null
          coinbase_payment_link_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          crypto_tx_hash?: string | null
          currency?: string
          description?: string
          escrow_status?: Database["public"]["Enums"]["escrow_status"] | null
          estimated_hours?: number | null
          human_id?: string
          id?: string
          payer_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          platform_fee?: number | null
          processor_fee?: number
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          stripe_checkout_session_id?: string | null
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      bounties: {
        Row: {
          agent_id: string
          application_count: number | null
          bounty_legitimacy_confidence: number
          bounty_legitimacy_score: number
          bounty_legitimacy_version: string
          budget_max: number
          budget_min: number
          created_at: string | null
          currency: string
          deadline: string | null
          description: string
          fixed_spot_amount: number | null
          id: string
          is_spam_suppressed: boolean
          moderation_confidence: number
          moderation_decision: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version: string
          moderation_reason_codes: string[]
          moderation_risk_score: number
          moderation_updated_at: string
          pricing_mode: Database["public"]["Enums"]["bounty_pricing_mode"]
          skills_required: string[] | null
          spots_available: number
          spots_filled: number
          spots_remaining: number | null
          status: Database["public"]["Enums"]["bounty_status"] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          agent_id: string
          application_count?: number | null
          bounty_legitimacy_confidence?: number
          bounty_legitimacy_score?: number
          bounty_legitimacy_version?: string
          budget_max: number
          budget_min: number
          created_at?: string | null
          currency?: string
          deadline?: string | null
          description: string
          fixed_spot_amount?: number | null
          id?: string
          is_spam_suppressed?: boolean
          moderation_confidence?: number
          moderation_decision?: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version?: string
          moderation_reason_codes?: string[]
          moderation_risk_score?: number
          moderation_updated_at?: string
          pricing_mode?: Database["public"]["Enums"]["bounty_pricing_mode"]
          skills_required?: string[] | null
          spots_available?: number
          spots_filled?: number
          spots_remaining?: number | null
          status?: Database["public"]["Enums"]["bounty_status"] | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          agent_id?: string
          application_count?: number | null
          bounty_legitimacy_confidence?: number
          bounty_legitimacy_score?: number
          bounty_legitimacy_version?: string
          budget_max?: number
          budget_min?: number
          created_at?: string | null
          currency?: string
          deadline?: string | null
          description?: string
          fixed_spot_amount?: number | null
          id?: string
          is_spam_suppressed?: boolean
          moderation_confidence?: number
          moderation_decision?: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version?: string
          moderation_reason_codes?: string[]
          moderation_risk_score?: number
          moderation_updated_at?: string
          pricing_mode?: Database["public"]["Enums"]["bounty_pricing_mode"]
          skills_required?: string[] | null
          spots_available?: number
          spots_filled?: number
          spots_remaining?: number | null
          status?: Database["public"]["Enums"]["bounty_status"] | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bounties_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string
          agent_unread_count: number | null
          booking_id: string | null
          bounty_id: string | null
          created_at: string | null
          human_id: string
          human_unread_count: number | null
          id: string
          last_message_at: string | null
        }
        Insert: {
          agent_id: string
          agent_unread_count?: number | null
          booking_id?: string | null
          bounty_id?: string | null
          created_at?: string | null
          human_id: string
          human_unread_count?: number | null
          id?: string
          last_message_at?: string | null
        }
        Update: {
          agent_id?: string
          agent_unread_count?: number | null
          booking_id?: string | null
          bounty_id?: string | null
          created_at?: string | null
          human_id?: string
          human_unread_count?: number | null
          id?: string
          last_message_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversations_booking"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          booking_id: string
          created_at: string | null
          evidence: Json | null
          human_payout_percent: number | null
          id: string
          opened_by_id: string
          opened_by_type: Database["public"]["Enums"]["message_sender_type"]
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"] | null
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          evidence?: Json | null
          human_payout_percent?: number | null
          id?: string
          opened_by_id: string
          opened_by_type: Database["public"]["Enums"]["message_sender_type"]
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"] | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          evidence?: Json | null
          human_payout_percent?: number | null
          id?: string
          opened_by_id?: string
          opened_by_type?: Database["public"]["Enums"]["message_sender_type"]
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      external_integrations: {
        Row: {
          agent_id: string
          created_at: string
          credentials_encrypted: string
          credentials_mask: string | null
          env: Database["public"]["Enums"]["external_provider_env"]
          id: string
          is_active: boolean
          provider: Database["public"]["Enums"]["external_provider"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          credentials_encrypted: string
          credentials_mask?: string | null
          env: Database["public"]["Enums"]["external_provider_env"]
          id?: string
          is_active?: boolean
          provider: Database["public"]["Enums"]["external_provider"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          credentials_encrypted?: string
          credentials_mask?: string | null
          env?: Database["public"]["Enums"]["external_provider_env"]
          id?: string
          is_active?: boolean
          provider?: Database["public"]["Enums"]["external_provider"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_integrations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      external_job_events: {
        Row: {
          agent_id: string
          created_at: string
          event_name: string
          id: string
          job_id: string
          payload: Json
          provider: Database["public"]["Enums"]["external_provider"]
          provider_env: Database["public"]["Enums"]["external_provider_env"]
          source: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          event_name: string
          id?: string
          job_id: string
          payload?: Json
          provider: Database["public"]["Enums"]["external_provider"]
          provider_env: Database["public"]["Enums"]["external_provider_env"]
          source: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          event_name?: string
          id?: string
          job_id?: string
          payload?: Json
          provider?: Database["public"]["Enums"]["external_provider"]
          provider_env?: Database["public"]["Enums"]["external_provider_env"]
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_job_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "external_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_jobs: {
        Row: {
          address: string
          agent_id: string
          auto_approve: boolean
          created_at: string
          error_message: string | null
          expires_at: string | null
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["external_job_kind"]
          provider: Database["public"]["Enums"]["external_provider"]
          provider_env: Database["public"]["Enums"]["external_provider_env"]
          provider_job_id: string | null
          provider_payload: Json
          provider_reference: string | null
          public_only: boolean
          result_payload: Json
          scheduled_at: string | null
          status: Database["public"]["Enums"]["external_job_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          address: string
          agent_id: string
          auto_approve?: boolean
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          id?: string
          instructions?: string | null
          kind: Database["public"]["Enums"]["external_job_kind"]
          provider: Database["public"]["Enums"]["external_provider"]
          provider_env: Database["public"]["Enums"]["external_provider_env"]
          provider_job_id?: string | null
          provider_payload?: Json
          provider_reference?: string | null
          public_only?: boolean
          result_payload?: Json
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["external_job_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          agent_id?: string
          auto_approve?: boolean
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["external_job_kind"]
          provider?: Database["public"]["Enums"]["external_provider"]
          provider_env?: Database["public"]["Enums"]["external_provider_env"]
          provider_job_id?: string | null
          provider_payload?: Json
          provider_reference?: string | null
          public_only?: boolean
          result_payload?: Json
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["external_job_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      humans: {
        Row: {
          availability: Json | null
          avatar_url: string | null
          bio: string | null
          completed_bookings: number | null
          created_at: string | null
          drive_radius_miles: number | null
          github_url: string | null
          human_legitimacy_confidence: number
          human_legitimacy_score: number
          human_legitimacy_version: string
          id: string
          instagram_url: string | null
          is_verified: boolean | null
          linkedin_url: string | null
          location: string | null
          name: string
          rate_max: number | null
          rate_min: number | null
          rating_average: number | null
          rating_count: number | null
          skills: string[] | null
          social_links: Json
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          timezone: string | null
          total_earnings: number | null
          updated_at: string | null
          user_id: string
          verified_at: string | null
          wallet_address: string | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          availability?: Json | null
          avatar_url?: string | null
          bio?: string | null
          completed_bookings?: number | null
          created_at?: string | null
          drive_radius_miles?: number | null
          github_url?: string | null
          human_legitimacy_confidence?: number
          human_legitimacy_score?: number
          human_legitimacy_version?: string
          id?: string
          instagram_url?: string | null
          is_verified?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          name: string
          rate_max?: number | null
          rate_min?: number | null
          rating_average?: number | null
          rating_count?: number | null
          skills?: string[] | null
          social_links?: Json
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          timezone?: string | null
          total_earnings?: number | null
          updated_at?: string | null
          user_id: string
          verified_at?: string | null
          wallet_address?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          availability?: Json | null
          avatar_url?: string | null
          bio?: string | null
          completed_bookings?: number | null
          created_at?: string | null
          drive_radius_miles?: number | null
          github_url?: string | null
          human_legitimacy_confidence?: number
          human_legitimacy_score?: number
          human_legitimacy_version?: string
          id?: string
          instagram_url?: string | null
          is_verified?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          name?: string
          rate_max?: number | null
          rate_min?: number | null
          rating_average?: number | null
          rating_count?: number | null
          skills?: string[] | null
          social_links?: Json
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          timezone?: string | null
          total_earnings?: number | null
          updated_at?: string | null
          user_id?: string
          verified_at?: string | null
          wallet_address?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      link_risk_cache: {
        Row: {
          canonical_url: string
          confidence: number
          created_at: string
          domain: string
          expires_at: string
          id: string
          metadata: Json
          provider: string
          reason_codes: string[]
          updated_at: string
          verdict: Database["public"]["Enums"]["moderation_decision"]
        }
        Insert: {
          canonical_url: string
          confidence?: number
          created_at?: string
          domain: string
          expires_at: string
          id?: string
          metadata?: Json
          provider?: string
          reason_codes?: string[]
          updated_at?: string
          verdict?: Database["public"]["Enums"]["moderation_decision"]
        }
        Update: {
          canonical_url?: string
          confidence?: number
          created_at?: string
          domain?: string
          expires_at?: string
          id?: string
          metadata?: Json
          provider?: string
          reason_codes?: string[]
          updated_at?: string
          verdict?: Database["public"]["Enums"]["moderation_decision"]
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          moderation_confidence: number
          moderation_decision: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version: string
          moderation_reason_codes: string[]
          moderation_risk_score: number
          moderation_updated_at: string
          read_at: string | null
          sender_id: string
          sender_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          moderation_confidence?: number
          moderation_decision?: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version?: string
          moderation_reason_codes?: string[]
          moderation_risk_score?: number
          moderation_updated_at?: string
          read_at?: string | null
          sender_id: string
          sender_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          moderation_confidence?: number
          moderation_decision?: Database["public"]["Enums"]["moderation_decision"]
          moderation_policy_version?: string
          moderation_reason_codes?: string[]
          moderation_risk_score?: number
          moderation_updated_at?: string
          read_at?: string | null
          sender_id?: string
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_daily_token_usage: {
        Row: {
          tokens_used: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          tokens_used?: number
          updated_at?: string
          usage_date: string
        }
        Update: {
          tokens_used?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      moderation_events: {
        Row: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["message_sender_type"]
          confidence: number
          content_id: string | null
          content_type: string
          created_at: string
          decision: Database["public"]["Enums"]["moderation_decision"]
          evidence: Json
          id: string
          model: string | null
          policy_version: string
          provider: string | null
          raw_content_hash: string | null
          reason_codes: string[]
          risk_score: number
          spam_action: string
          surface: Database["public"]["Enums"]["moderation_surface"]
        }
        Insert: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["message_sender_type"]
          confidence?: number
          content_id?: string | null
          content_type: string
          created_at?: string
          decision: Database["public"]["Enums"]["moderation_decision"]
          evidence?: Json
          id?: string
          model?: string | null
          policy_version: string
          provider?: string | null
          raw_content_hash?: string | null
          reason_codes?: string[]
          risk_score?: number
          spam_action?: string
          surface: Database["public"]["Enums"]["moderation_surface"]
        }
        Update: {
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["message_sender_type"]
          confidence?: number
          content_id?: string | null
          content_type?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["moderation_decision"]
          evidence?: Json
          id?: string
          model?: string | null
          policy_version?: string
          provider?: string | null
          raw_content_hash?: string | null
          reason_codes?: string[]
          risk_score?: number
          spam_action?: string
          surface?: Database["public"]["Enums"]["moderation_surface"]
        }
        Relationships: []
      }
      moderation_rescan_queue: {
        Row: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["message_sender_type"]
          attempt_count: number
          content_id: string | null
          content_text: string
          content_type: string
          created_at: string
          id: string
          last_error: string | null
          next_run_at: string
          reason: string
          status: string
          surface: Database["public"]["Enums"]["moderation_surface"]
          updated_at: string
        }
        Insert: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["message_sender_type"]
          attempt_count?: number
          content_id?: string | null
          content_text: string
          content_type: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_run_at?: string
          reason: string
          status?: string
          surface: Database["public"]["Enums"]["moderation_surface"]
          updated_at?: string
        }
        Update: {
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["message_sender_type"]
          attempt_count?: number
          content_id?: string | null
          content_text?: string
          content_type?: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_run_at?: string
          reason?: string
          status?: string
          surface?: Database["public"]["Enums"]["moderation_surface"]
          updated_at?: string
        }
        Relationships: []
      }
      moderation_runtime_config: {
        Row: {
          created_at: string
          daily_token_budget: number
          fail_confidence: number
          id: number
          max_input_chars: number
          model_escalation: string
          model_primary: string
          policy_version: string
          provider: string
          timeout_ms: number
          updated_at: string
          updated_by: string | null
          warn_confidence: number
        }
        Insert: {
          created_at?: string
          daily_token_budget?: number
          fail_confidence?: number
          id: number
          max_input_chars?: number
          model_escalation?: string
          model_primary?: string
          policy_version?: string
          provider?: string
          timeout_ms?: number
          updated_at?: string
          updated_by?: string | null
          warn_confidence?: number
        }
        Update: {
          created_at?: string
          daily_token_budget?: number
          fail_confidence?: number
          id?: number
          max_input_chars?: number
          model_escalation?: string
          model_primary?: string
          policy_version?: string
          provider?: string
          timeout_ms?: number
          updated_at?: string
          updated_by?: string | null
          warn_confidence?: number
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          channel_config: Json
          channel_type: Database["public"]["Enums"]["notification_channel_type"]
          created_at: string
          delivery_count: number | null
          enabled: boolean
          entity_id: string
          entity_type: Database["public"]["Enums"]["message_sender_type"]
          failure_count: number | null
          id: string
          last_delivered_at: string | null
          last_error: string | null
          name: string | null
          updated_at: string
        }
        Insert: {
          channel_config?: Json
          channel_type: Database["public"]["Enums"]["notification_channel_type"]
          created_at?: string
          delivery_count?: number | null
          enabled?: boolean
          entity_id: string
          entity_type: Database["public"]["Enums"]["message_sender_type"]
          failure_count?: number | null
          id?: string
          last_delivered_at?: string | null
          last_error?: string | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          channel_config?: Json
          channel_type?: Database["public"]["Enums"]["notification_channel_type"]
          created_at?: string
          delivery_count?: number | null
          enabled?: boolean
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["message_sender_type"]
          failure_count?: number | null
          id?: string
          last_delivered_at?: string | null
          last_error?: string | null
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_delivery_log: {
        Row: {
          channel_id: string
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          notification_id: string
          response_body: string | null
          response_status: number | null
          status: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          notification_id: string
          response_body?: string | null
          response_status?: number | null
          status: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          notification_id?: string
          response_body?: string | null
          response_status?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          read_at: string | null
          recipient_id: string
          recipient_type: Database["public"]["Enums"]["message_sender_type"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          recipient_id: string
          recipient_type: Database["public"]["Enums"]["message_sender_type"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          recipient_id?: string
          recipient_type?: Database["public"]["Enums"]["message_sender_type"]
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: []
      }
      proofs: {
        Row: {
          attachments: Json | null
          booking_id: string
          created_at: string | null
          description: string
          feedback: string | null
          hours_worked: number
          human_id: string
          id: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["proof_status"] | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          booking_id: string
          created_at?: string | null
          description: string
          feedback?: string | null
          hours_worked: number
          human_id: string
          id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["proof_status"] | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          booking_id?: string
          created_at?: string | null
          description?: string
          feedback?: string | null
          hours_worked?: number
          human_id?: string
          id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["proof_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proofs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofs_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_score_components: {
        Row: {
          component_key: string
          contribution: number
          created_at: string
          id: number
          normalized_value: number
          raw_value: number
          snapshot_id: number
          weight: number
        }
        Insert: {
          component_key: string
          contribution: number
          created_at?: string
          id?: number
          normalized_value: number
          raw_value: number
          snapshot_id: number
          weight: number
        }
        Update: {
          component_key?: string
          contribution?: number
          created_at?: string
          id?: number
          normalized_value?: number
          raw_value?: number
          snapshot_id?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "quality_score_components_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "quality_score_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_score_snapshots: {
        Row: {
          computed_at: string
          confidence: number
          entity_id: string
          entity_type: string
          id: number
          metadata: Json
          sample_size: number
          score_type: string
          score_value: number
          version: string
        }
        Insert: {
          computed_at?: string
          confidence: number
          entity_id: string
          entity_type: string
          id?: number
          metadata?: Json
          sample_size?: number
          score_type: string
          score_value: number
          version: string
        }
        Update: {
          computed_at?: string
          confidence?: number
          entity_id?: string
          entity_type?: string
          id?: number
          metadata?: Json
          sample_size?: number
          score_type?: string
          score_value?: number
          version?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string | null
          id: string
          rating: number
          reviewee_id: string
          reviewee_type: Database["public"]["Enums"]["message_sender_type"]
          reviewer_id: string
          reviewer_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          rating: number
          reviewee_id: string
          reviewee_type: Database["public"]["Enums"]["message_sender_type"]
          reviewer_id: string
          reviewer_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          rating?: number
          reviewee_id?: string
          reviewee_type?: Database["public"]["Enums"]["message_sender_type"]
          reviewer_id?: string
          reviewer_type?: Database["public"]["Enums"]["message_sender_type"]
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      spam_clusters: {
        Row: {
          actor_count: number
          cluster_key: string
          content_hash: string
          created_at: string
          dominant_reason: string | null
          id: string
          last_seen_at: string
          status: string
          surface: Database["public"]["Enums"]["moderation_surface"]
          updated_at: string
          volume: number
        }
        Insert: {
          actor_count?: number
          cluster_key: string
          content_hash: string
          created_at?: string
          dominant_reason?: string | null
          id?: string
          last_seen_at?: string
          status?: string
          surface: Database["public"]["Enums"]["moderation_surface"]
          updated_at?: string
          volume?: number
        }
        Update: {
          actor_count?: number
          cluster_key?: string
          content_hash?: string
          created_at?: string
          dominant_reason?: string | null
          id?: string
          last_seen_at?: string
          status?: string
          surface?: Database["public"]["Enums"]["moderation_surface"]
          updated_at?: string
          volume?: number
        }
        Relationships: []
      }
      spam_fingerprints: {
        Row: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["message_sender_type"]
          content_hash: string
          created_at: string
          id: string
          primary_domain: string | null
          simhash: string
          surface: Database["public"]["Enums"]["moderation_surface"]
        }
        Insert: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["message_sender_type"]
          content_hash: string
          created_at?: string
          id?: string
          primary_domain?: string | null
          simhash: string
          surface: Database["public"]["Enums"]["moderation_surface"]
        }
        Update: {
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["message_sender_type"]
          content_hash?: string
          created_at?: string
          id?: string
          primary_domain?: string | null
          simhash?: string
          surface?: Database["public"]["Enums"]["moderation_surface"]
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          booking_id: string
          coinbase_payment_operation_id: string | null
          created_at: string | null
          crypto_tx_hash: string | null
          currency: string
          description: string | null
          from_agent_id: string | null
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          stripe_transfer_id: string | null
          to_human_id: string | null
          type: string
        }
        Insert: {
          amount: number
          booking_id: string
          coinbase_payment_operation_id?: string | null
          created_at?: string | null
          crypto_tx_hash?: string | null
          currency?: string
          description?: string | null
          from_agent_id?: string | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          stripe_transfer_id?: string | null
          to_human_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          booking_id?: string
          coinbase_payment_operation_id?: string | null
          created_at?: string | null
          crypto_tx_hash?: string | null
          currency?: string
          description?: string | null
          from_agent_id?: string | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          stripe_transfer_id?: string | null
          to_human_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_human_id_fkey"
            columns: ["to_human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          event_id: string
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_bounty_application_with_capacity: {
        Args: {
          p_bounty_id: string
          p_application_id: string
          p_agent_id: string
        }
        Returns: {
          accepted: boolean
          reason: string
          bounty_id: string
          application_id: string
          human_id: string
          proposed_rate: number
          estimated_hours: number
          bounty_title: string
          bounty_currency: string
          pricing_mode: Database["public"]["Enums"]["bounty_pricing_mode"]
          fixed_spot_amount: number
          spots_available: number
          spots_filled: number
          spots_remaining: number
          bounty_status: Database["public"]["Enums"]["bounty_status"]
          application_status: Database["public"]["Enums"]["application_status"]
        }[]
      }
      compute_agent_legitimacy_v1: {
        Args: {
          p_agent_id: string
        }
        Returns: {
          agent_id: string
          score: number
          confidence: number
          version: string
          sample_size: number
        }[]
      }
      compute_bounty_legitimacy_v1: {
        Args: {
          p_bounty_id: string
        }
        Returns: {
          bounty_id: string
          score: number
          confidence: number
          version: string
          sample_size: number
        }[]
      }
      compute_human_legitimacy_v1: {
        Args: {
          p_human_id: string
        }
        Returns: {
          human_id: string
          score: number
          confidence: number
          version: string
          sample_size: number
        }[]
      }
      current_owner_agent_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      ensure_booking_settlement_records_v1: {
        Args: {
          p_booking_id: string
          p_agent_id: string
          p_human_id: string
          p_amount: number
          p_platform_fee: number
          p_currency: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_crypto_tx_hash?: string
          p_escrow_release_description?: string
          p_platform_fee_description?: string
        }
        Returns: {
          inserted_escrow_release: boolean
          inserted_platform_fee: boolean
        }[]
      }
      ensure_booking_settlement_records_v2: {
        Args: {
          p_booking_id: string
          p_agent_id: string
          p_human_id: string
          p_amount: number
          p_platform_fee: number
          p_currency: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_payer_amount: number
          p_crypto_tx_hash?: string
          p_escrow_release_description?: string
          p_platform_fee_description?: string
        }
        Returns: {
          inserted_escrow_release: boolean
          inserted_platform_fee: boolean
        }[]
      }
      humans_social_links_allowed_keys: {
        Args: {
          input_links: Json
        }
        Returns: boolean
      }
      increment_channel_delivery_count: {
        Args: {
          p_channel_id: string
        }
        Returns: undefined
      }
      increment_channel_failure_count: {
        Args: {
          p_channel_id: string
          p_error?: string
        }
        Returns: undefined
      }
      quality_bayes_rate: {
        Args: {
          p_successes: number
          p_total: number
          p_prior_mean?: number
          p_prior_strength?: number
        }
        Returns: number
      }
      quality_clamp01: {
        Args: {
          p_value: number
        }
        Returns: number
      }
      quality_clamp100: {
        Args: {
          p_value: number
        }
        Returns: number
      }
      quality_confidence: {
        Args: {
          p_sample_size: number
          p_k?: number
        }
        Returns: number
      }
      quality_time_decay: {
        Args: {
          p_event_ts: string
          p_half_life_days?: number
        }
        Returns: number
      }
      recompute_quality_scores_for_bounty_v1: {
        Args: {
          p_bounty_id: string
        }
        Returns: {
          bounty_id: string
          bounty_score: number
          bounty_confidence: number
          humans_recomputed: number
          agents_recomputed: number
        }[]
      }
      recompute_quality_scores_v1: {
        Args: {
          p_since?: string
        }
        Returns: {
          bounties_recomputed: number
          humans_recomputed: number
          agents_recomputed: number
        }[]
      }
      try_consume_moderation_tokens_v1: {
        Args: {
          p_tokens: number
        }
        Returns: boolean
      }
    }
    Enums: {
      application_status: "pending" | "accepted" | "rejected" | "withdrawn"
      autopilot_run_status:
        | "planned"
        | "running"
        | "completed"
        | "failed"
        | "skipped"
      booking_status:
        | "pending"
        | "funded"
        | "in_progress"
        | "submitted"
        | "completed"
        | "disputed"
        | "cancelled"
      bounty_pricing_mode: "bid" | "fixed_per_spot"
      bounty_status: "open" | "in_progress" | "completed" | "cancelled"
      dispute_status: "open" | "under_review" | "resolved" | "dismissed"
      escrow_status: "pending" | "funded" | "released" | "refunded" | "disputed"
      external_job_kind: "field_check"
      external_job_status:
        | "open"
        | "in_progress"
        | "action_required"
        | "completed"
        | "cancelled"
        | "expired"
        | "failed"
      external_provider: "proxypics" | "wegolook"
      external_provider_env: "live" | "sandbox"
      message_sender_type: "human" | "agent"
      moderation_decision: "allow" | "warn" | "fail" | "unscanned"
      moderation_surface:
        | "bounty"
        | "application"
        | "message"
        | "conversation_initial"
      notification_channel_type: "webhook" | "email" | "slack" | "discord"
      notification_type:
        | "new_application"
        | "application_accepted"
        | "application_rejected"
        | "new_message"
        | "booking_created"
        | "escrow_funded"
        | "proof_submitted"
        | "proof_approved"
        | "proof_rejected"
        | "review_received"
        | "dispute_opened"
        | "dispute_resolved"
        | "autopilot_action"
        | "payment_failed"
        | "external_job_created"
        | "external_job_updated"
        | "external_job_completed"
        | "external_job_failed"
      payment_method: "stripe" | "crypto"
      proof_status: "pending" | "approved" | "rejected"
      user_role: "human" | "agent" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

// Compatibility aliases used by the web app.
export type Human = Tables<'humans'>
export type Message = Omit<Tables<'messages'>, 'created_at'> & { created_at: string }

export interface TimeSlot {
  start: string
  end: string
}

export interface AvailabilitySchedule {
  monday?: TimeSlot[]
  tuesday?: TimeSlot[]
  wednesday?: TimeSlot[]
  thursday?: TimeSlot[]
  friday?: TimeSlot[]
  saturday?: TimeSlot[]
  sunday?: TimeSlot[]
}

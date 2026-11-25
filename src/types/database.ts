export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      barber_breaks: {
        Row: {
          barbershop_id: string;
          barber_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          is_active: boolean;
        };
        Insert: {
          barbershop_id: string;
          barber_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          is_active?: boolean;
        };
        Update: { starts_at?: string; ends_at?: string; is_active?: boolean };
        Relationships: [];
      };
      appointment_ratings: {
        Row: {
          appointment_id: string;
          barbershop_id: string;
          barber_id: string;
          barber_score: number | null;
          shop_score: number | null;
          recorded_by: string | null;
          recorded_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      barbershops: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          phone: string | null;
          email: string | null;
          address_street: string | null;
          address_number: string | null;
          address_complement: string | null;
          address_district: string | null;
          address_city: string | null;
          address_state: string | null;
          address_zip: string | null;
          timezone: string;
          logo_url: string | null;
          cover_url: string | null;
          status: Database["public"]["Enums"]["barbershop_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          address_street?: string | null;
          address_number?: string | null;
          address_complement?: string | null;
          address_district?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_zip?: string | null;
          timezone?: string;
          logo_url?: string | null;
          cover_url?: string | null;
          status?: Database["public"]["Enums"]["barbershop_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          address_street?: string | null;
          address_number?: string | null;
          address_complement?: string | null;
          address_district?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_zip?: string | null;
          timezone?: string;
          logo_url?: string | null;
          cover_url?: string | null;
          status?: Database["public"]["Enums"]["barbershop_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      barbershop_members: {
        Row: {
          id: string;
          barbershop_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["barbershop_member_role"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["barbershop_member_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["barbershop_member_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      barbers: {
        Row: {
          id: string;
          barbershop_id: string;
          user_id: string | null;
          name: string;
          bio: string | null;
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          user_id?: string | null;
          name: string;
          bio?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          user_id?: string | null;
          name?: string;
          bio?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          barbershop_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price_cents: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          name: string;
          description?: string | null;
          duration_minutes: number;
          price_cents: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price_cents?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      barber_services: {
        Row: {
          barber_id: string;
          service_id: string;
          barbershop_id: string;
          created_at: string;
        };
        Insert: {
          barber_id: string;
          service_id: string;
          barbershop_id: string;
          created_at?: string;
        };
        Update: {
          barber_id?: string;
          service_id?: string;
          barbershop_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      business_hours: {
        Row: {
          id: string;
          barbershop_id: string;
          weekday: number;
          opens_at: string;
          closes_at: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          weekday: number;
          opens_at: string;
          closes_at: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          weekday?: number;
          opens_at?: string;
          closes_at?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      barber_working_hours: {
        Row: {
          id: string;
          barber_id: string;
          barbershop_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barber_id: string;
          barbershop_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barber_id?: string;
          barbershop_id?: string;
          weekday?: number;
          starts_at?: string;
          ends_at?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      blocked_slots: {
        Row: {
          id: string;
          barbershop_id: string;
          barber_id: string | null;
          starts_at: string;
          ends_at: string;
          reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          barber_id?: string | null;
          starts_at: string;
          ends_at: string;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          barber_id?: string | null;
          starts_at?: string;
          ends_at?: string;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          barbershop_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          birth_date: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          barbershop_id: string;
          customer_id: string;
          barber_id: string;
          service_id: string;
          starts_at: string;
          ends_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          price_cents: number;
          notes: string | null;
          cancel_reason: string | null;
          public_token: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          customer_id: string;
          barber_id: string;
          service_id: string;
          starts_at: string;
          ends_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          price_cents: number;
          notes?: string | null;
          cancel_reason?: string | null;
          public_token?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          customer_id?: string;
          barber_id?: string;
          service_id?: string;
          starts_at?: string;
          ends_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          price_cents?: number;
          notes?: string | null;
          cancel_reason?: string | null;
          public_token?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      booking_rate_limits: {
        Row: {
          bucket: string;
          window_start: string;
          hits: number;
          updated_at: string;
        };
        Insert: {
          bucket: string;
          window_start: string;
          hits?: number;
          updated_at?: string;
        };
        Update: {
          bucket?: string;
          window_start?: string;
          hits?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price_cents: number;
          interval: Database["public"]["Enums"]["billing_interval"];
          features: Json;
          max_barbers: number | null;
          is_active: boolean;
          currency: string;
          trial_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          price_cents: number;
          interval?: Database["public"]["Enums"]["billing_interval"];
          features?: Json;
          max_barbers?: number | null;
          is_active?: boolean;
          currency?: string;
          trial_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          interval?: Database["public"]["Enums"]["billing_interval"];
          features?: Json;
          max_barbers?: number | null;
          is_active?: boolean;
          currency?: string;
          trial_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_customers: {
        Row: {
          id: string;
          barbershop_id: string;
          gateway: string;
          gateway_customer_id: string | null;
          person_type: string;
          document_digits: string;
          holder_name: string;
          email: string | null;
          phone_digits: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          barbershop_id: string;
          gateway?: string;
          gateway_customer_id?: string | null;
          person_type: string;
          document_digits: string;
          holder_name: string;
          email?: string | null;
          phone_digits?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          barbershop_id?: string;
          gateway?: string;
          gateway_customer_id?: string | null;
          person_type?: string;
          document_digits?: string;
          holder_name?: string;
          email?: string | null;
          phone_digits?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_remote_cleanup_jobs: {
        Row: {
          id: string;
          subscription_id: string;
          barbershop_id: string;
          provider: string;
          external_reference: string;
          gateway_subscription_id: string | null;
          status: "pending" | "processing" | "retry" | "completed" | "manual_review";
          attempts: number;
          locked_at: string | null;
          lease_token: string | null;
          next_attempt_at: string;
          last_error: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          subscription_id: string;
          barbershop_id: string;
          provider?: string;
          external_reference: string;
          gateway_subscription_id?: string | null;
          status?: "pending" | "processing" | "retry" | "completed" | "manual_review";
          attempts?: number;
          locked_at?: string | null;
          lease_token?: string | null;
          next_attempt_at?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          subscription_id?: string;
          barbershop_id?: string;
          provider?: string;
          external_reference?: string;
          gateway_subscription_id?: string | null;
          status?: "pending" | "processing" | "retry" | "completed" | "manual_review";
          attempts?: number;
          locked_at?: string | null;
          lease_token?: string | null;
          next_attempt_at?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          invoice_link_key: string;
          agreement_at: string | null;
          coverage_starts_at: string | null;
          first_competence: string | null;
          first_due_at: string | null;
          renewal_anchor_day: number | null;
          due_anchor_day: number | null;
          due_month_offset: number | null;
          due_local_time: string | null;
          contract_timezone: string | null;
          agreement_terms: string | null;
          id: string;
          barbershop_id: string;
          plan_id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          current_period_start: string | null;
          current_period_end: string | null;
          trial_started_at: string | null;
          trial_ends_at: string | null;
          contracted_price_cents: number | null;
          contracted_currency: string | null;
          contracted_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null;
          trial_finalization_locked_at: string | null;
          trial_finalization_lease_token: string | null;
          trial_finalization_attempted_at: string | null;
          trial_finalization_attempts: number;
          trial_finalization_error: string | null;
          trial_finalized_at: string | null;
          past_due_since: string | null;
          grace_period_ends_at: string | null;
          checkout_locked_at: string | null;
          checkout_lease_token: string | null;
          checkout_attempted_at: string | null;
          checkout_attempts: number;
          checkout_error: string | null;
          remote_cleanup_pending: boolean;
          cancel_at_period_end: boolean;
          gateway: string;
          gateway_subscription_id: string | null;
          billing_type: Database["public"]["Enums"]["payment_method"] | null;
          gateway_status: string;
          external_reference: string;
          next_due_date: string | null;
          canceled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          invoice_link_key?: string;
          agreement_at?: string | null;
          coverage_starts_at?: string | null;
          first_competence?: string | null;
          first_due_at?: string | null;
          renewal_anchor_day?: number | null;
          due_anchor_day?: number | null;
          due_month_offset?: number | null;
          due_local_time?: string | null;
          contract_timezone?: string | null;
          agreement_terms?: string | null;
          id?: string;
          barbershop_id: string;
          plan_id: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          contracted_price_cents?: number | null;
          contracted_currency?: string | null;
          contracted_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null;
          trial_finalization_locked_at?: string | null;
          trial_finalization_lease_token?: string | null;
          trial_finalization_attempted_at?: string | null;
          trial_finalization_attempts?: number;
          trial_finalization_error?: string | null;
          trial_finalized_at?: string | null;
          past_due_since?: string | null;
          grace_period_ends_at?: string | null;
          checkout_locked_at?: string | null;
          checkout_lease_token?: string | null;
          checkout_attempted_at?: string | null;
          checkout_attempts?: number;
          checkout_error?: string | null;
          remote_cleanup_pending?: boolean;
          cancel_at_period_end?: boolean;
          gateway?: string;
          gateway_subscription_id?: string | null;
          billing_type?: Database["public"]["Enums"]["payment_method"] | null;
          gateway_status?: string;
          external_reference?: string;
          next_due_date?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          invoice_link_key?: string;
          agreement_at?: string | null;
          coverage_starts_at?: string | null;
          first_competence?: string | null;
          first_due_at?: string | null;
          renewal_anchor_day?: number | null;
          due_anchor_day?: number | null;
          due_month_offset?: number | null;
          due_local_time?: string | null;
          contract_timezone?: string | null;
          agreement_terms?: string | null;
          id?: string;
          barbershop_id?: string;
          plan_id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          contracted_price_cents?: number | null;
          contracted_currency?: string | null;
          contracted_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null;
          trial_finalization_locked_at?: string | null;
          trial_finalization_lease_token?: string | null;
          trial_finalization_attempted_at?: string | null;
          trial_finalization_attempts?: number;
          trial_finalization_error?: string | null;
          trial_finalized_at?: string | null;
          past_due_since?: string | null;
          grace_period_ends_at?: string | null;
          checkout_locked_at?: string | null;
          checkout_lease_token?: string | null;
          checkout_attempted_at?: string | null;
          checkout_attempts?: number;
          checkout_error?: string | null;
          remote_cleanup_pending?: boolean;
          cancel_at_period_end?: boolean;
          gateway?: string;
          gateway_subscription_id?: string | null;
          billing_type?: Database["public"]["Enums"]["payment_method"] | null;
          gateway_status?: string;
          external_reference?: string;
          next_due_date?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          invoice_link_key: string;
          competence: string | null;
          original_amount_cents: number | null;
          adjustment_cents: number | null;
          adjustment_reason: string | null;
          due_at: string | null;
          due_timezone: string | null;
          verified_at: string | null;
          verified_by: string | null;
          receipt_reference: string | null;
          id: string;
          barbershop_id: string;
          subscription_id: string | null;
          appointment_id: string | null;
          amount_cents: number;
          status: Database["public"]["Enums"]["payment_status"];
          method: Database["public"]["Enums"]["payment_method"] | null;
          scope: Database["public"]["Enums"]["payment_scope"];
          due_date: string | null;
          paid_at: string | null;
          gateway: string;
          gateway_payment_id: string | null;
          invoice_url: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          invoice_link_key?: string;
          competence?: string | null;
          original_amount_cents?: number | null;
          adjustment_cents?: number | null;
          adjustment_reason?: string | null;
          due_at?: string | null;
          due_timezone?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          receipt_reference?: string | null;
          id?: string;
          barbershop_id: string;
          subscription_id?: string | null;
          appointment_id?: string | null;
          amount_cents: number;
          status?: Database["public"]["Enums"]["payment_status"];
          method?: Database["public"]["Enums"]["payment_method"] | null;
          scope?: Database["public"]["Enums"]["payment_scope"];
          due_date?: string | null;
          paid_at?: string | null;
          gateway?: string;
          gateway_payment_id?: string | null;
          invoice_url?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          invoice_link_key?: string;
          competence?: string | null;
          original_amount_cents?: number | null;
          adjustment_cents?: number | null;
          adjustment_reason?: string | null;
          due_at?: string | null;
          due_timezone?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          receipt_reference?: string | null;
          id?: string;
          barbershop_id?: string;
          subscription_id?: string | null;
          appointment_id?: string | null;
          amount_cents?: number;
          status?: Database["public"]["Enums"]["payment_status"];
          method?: Database["public"]["Enums"]["payment_method"] | null;
          scope?: Database["public"]["Enums"]["payment_scope"];
          due_date?: string | null;
          paid_at?: string | null;
          gateway?: string;
          gateway_payment_id?: string | null;
          invoice_url?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          payload: Json;
          status: Database["public"]["Enums"]["webhook_status"];
          processed_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          event_id: string;
          event_type: string;
          payload: Json;
          status?: Database["public"]["Enums"]["webhook_status"];
          processed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          event_id?: string;
          event_type?: string;
          payload?: Json;
          status?: Database["public"]["Enums"]["webhook_status"];
          processed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          appointment_id: string | null;
          id: string;
          barbershop_id: string;
          user_id: string | null;
          title: string;
          body: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          status: Database["public"]["Enums"]["notification_status"];
          read_at: string | null;
          data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          appointment_id?: string | null;
          id?: string;
          barbershop_id: string;
          user_id?: string | null;
          title: string;
          body: string;
          channel?: Database["public"]["Enums"]["notification_channel"];
          status?: Database["public"]["Enums"]["notification_status"];
          read_at?: string | null;
          data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          appointment_id?: string | null;
          id?: string;
          barbershop_id?: string;
          user_id?: string | null;
          title?: string;
          body?: string;
          channel?: Database["public"]["Enums"]["notification_channel"];
          status?: Database["public"]["Enums"]["notification_status"];
          read_at?: string | null;
          data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          extension_link_key: string | null;
          id: string;
          barbershop_id: string | null;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          extension_link_key?: string | null;
          id?: string;
          barbershop_id?: string | null;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          extension_link_key?: string | null;
          id?: string;
          barbershop_id?: string | null;
          actor_user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      booking_notices: {
        Args: { shop: string; page_size?: number };
        Returns: {
          notice_id: string;
          booking_id: string;
          customer_name: string;
          service_name: string;
          barber_name: string;
          starts: string;
          booking_status: Database["public"]["Enums"]["appointment_status"];
          is_read: boolean;
        }[];
      };
      book_new_walk_in: {
        Args: {
          shop: string;
          professional: string;
          service: string;
          customer_name: string;
          starts: string;
          note: string;
        };
        Returns: string;
      };
      complete_rated_appointment: {
        Args: {
          shop: string;
          booking: string;
          barber_score: number | null;
          shop_score: number | null;
        };
        Returns: undefined;
      };
      rating_summary: {
        Args: { shop: string };
        Returns: {
          barber_id: string | null;
          average_score: number | null;
          votes: number;
        }[];
      };
      finance_capability: { Args: Record<never, never>; Returns: "operator" | "manager" };
      finance_directory: { Args: { shop_id?: string | null; name_prefix?: string | null; origin_filter?: string | null;
        after_id?: string | null; page_size?: number }; Returns: Json[] };
      finance_overview: { Args: { bill_month: string }; Returns: Json };
      finance_operator_list: { Args: { after_id?: string | null; page_size?: number }; Returns: Json[] };
      finance_activity: { Args: { source_name: "journal" | "events"; tenant?: string | null; kind?: string | null;
        who?: string | null; since_at?: string | null; until_at?: string | null; before_at?: string | null;
        before_id?: string | null; page_size?: number }; Returns: Json[] };
      finance_operator: { Args: { target: string; permission: "operator" | "manager" | "revoke"; reason: string }; Returns: string };
      finance_agreement: { Args: { op: string; shop: string; terms: Json; reference: string; reason: string }; Returns: Json };
      finance_invoice: { Args: { op: string; shop: string; contract: string; competence: string }; Returns: Json };
      finance_confirm_pix: {
        Args: { op: string; shop: string; contract: string; invoice: string; received_cents: number;
          credited_at: string; checked: boolean; reference?: string | null };
        Returns: Json;
      };
      finance_contract_action: {
        Args: { op: string; shop: string; contract: string; command: "suspend" | "resume" | "cancel"; reason: string };
        Returns: Json;
      };
      finance_shops: { Args: { after_id?: string | null; page_size?: number }; Returns: Json[] };
      finance_invoices: { Args: { shop: string | null; bill_month: string | null; state: Database["public"]["Enums"]["payment_status"] | null;
        after_id?: string | null; page_size?: number }; Returns: Json[] };
      finance_totals: { Args: { bill_month: string; shop?: string | null }; Returns: Json };
      finance_history: { Args: { shop: string; after_id?: string | null; page_size?: number }; Returns: Json[] };
      finance_events: { Args: { shop: string; after_id?: string | null; page_size?: number }; Returns: Json[] };
      authorize_manual_trial_intent: {
        Args: { p_actor: string; p_intent_id: string; p_name: string; p_slug: string; p_phone: string | null; p_timezone: string };
        Returns: undefined;
      };
      get_owner_manual_trial: { Args: { p_shop: string }; Returns: Json };
      replace_barber_photo: { Args: {actor:string;shop:string;professional:string;previous:string|null;replacement:string|null}; Returns: boolean };
      replace_barbershop_logo: {
        Args: {
          p_barbershop_id: string;
          p_expected_object: string | null;
          p_replacement_object: string | null;
        };
        Returns: Json;
      };
      barbershop_logo_cleanup_list: {
        Args: { p_barbershop_id: string };
        Returns: string[];
      };
      barbershop_logo_cleanup_result: {
        Args: {
          p_barbershop_id: string;
          p_object_name: string;
          p_removed: boolean;
        };
        Returns: boolean;
      };
      finance_health: { Args: Record<string, never>; Returns: Json };
      get_shop_professional_limit: {
        Args: { p_shop: string };
        Returns: { plan_name: string; max_barbers: number | null }[];
      };
      create_barbershop_with_manual_trial: {
        Args: {
          p_intent_id: string;
          p_name: string;
          p_slug: string;
          p_phone?: string | null;
          p_timezone?: string;
        };
        Returns: string;
      };
      create_barbershop: {
        Args: {
          p_name: string;
          p_slug: string;
          p_phone?: string | null;
          p_timezone?: string;
        };
        Returns: string;
      };
      consume_booking_rate_limit: {
        Args: {
          p_bucket: string;
          p_window_seconds: number;
          p_limit: number;
        };
        Returns: boolean;
      };
      find_or_create_public_customer: {
        Args: {
          p_barbershop_id: string;
          p_full_name: string;
          p_phone: string;
          p_email: string | null;
        };
        Returns: string;
      };
      cancel_subscription_with_cleanup: {
        Args: {
          p_subscription_id: string;
          p_barbershop_id: string;
          p_cancel_reason?: string | null;
        };
        Returns: Json;
      };
      get_barbershop_booking_access: {
        Args: { p_barbershop_id: string };
        Returns: Json;
      };
      sync_subscription_from_asaas_payment: {
        Args: { p_payment_id: string };
        Returns: boolean;
      };
      apply_asaas_payment_transition: {
        Args: {
          p_barbershop_id: string;
          p_subscription_id: string;
          p_gateway_payment_id: string;
          p_amount_cents: number;
          p_status: Database["public"]["Enums"]["payment_status"];
          p_method: Database["public"]["Enums"]["payment_method"] | null;
          p_due_date: string | null;
          p_paid_at: string | null;
          p_invoice_url: string | null;
          p_metadata: Json;
          p_expected_status:
            | Database["public"]["Enums"]["payment_status"]
            | null;
          p_expected_updated_at: string | null;
          p_expected_metadata: Json | null;
          p_sync_subscription: boolean;
        };
        Returns: string | null;
      };
    };
    Enums: {
      barbershop_status: "active" | "inactive" | "suspended";
      barbershop_member_role: "owner" | "staff";
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show";
      subscription_status: "pending" | "trialing" | "active" | "past_due" | "canceled" | "expired";
      billing_interval: "month" | "year";
      payment_status: "pending" | "overdue" | "paid" | "failed" | "refunded" | "cancelled";
      payment_method: "boleto" | "pix" | "credit_card" | "debit_card" | "cash" | "bank_transfer" | "other";
      payment_scope: "shop_service" | "platform_subscription";
      notification_channel: "in_app" | "email" | "whatsapp";
      notification_status: "pending" | "sent" | "failed" | "read";
      webhook_status: "received" | "processing" | "processed" | "failed" | "ignored";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] & Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends keyof Database["public"]["Enums"] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never;

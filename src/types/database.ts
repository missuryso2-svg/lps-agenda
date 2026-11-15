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
      subscriptions: {
        Row: {
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
          trial_finalization_attempted_at: string | null;
          trial_finalization_attempts: number;
          trial_finalization_error: string | null;
          trial_finalized_at: string | null;
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
          trial_finalization_attempted_at?: string | null;
          trial_finalization_attempts?: number;
          trial_finalization_error?: string | null;
          trial_finalized_at?: string | null;
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
          trial_finalization_attempted_at?: string | null;
          trial_finalization_attempts?: number;
          trial_finalization_error?: string | null;
          trial_finalized_at?: string | null;
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

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
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
      admins: {
        Row: {
          created_at: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name: string
          id: string
          last_name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          delivered_at: string | null
          id: string
          request_id: string
          sent_at: string
          status: Database["public"]["Enums"]["notification_status"]
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          delivered_at?: string | null
          id?: string
          request_id: string
          sent_at?: string
          status?: Database["public"]["Enums"]["notification_status"]
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          delivered_at?: string | null
          id?: string
          request_id?: string
          sent_at?: string
          status?: Database["public"]["Enums"]["notification_status"]
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      response_tokens: {
        Row: {
          action: Database["public"]["Enums"]["token_action"] | null
          created_at: string
          expires_at: string
          id: string
          request_id: string
          token: string
          updated_at: string
          used_at: string | null
          volunteer_id: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["token_action"] | null
          created_at?: string
          expires_at: string
          id?: string
          request_id: string
          token: string
          updated_at?: string
          used_at?: string | null
          volunteer_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["token_action"] | null
          created_at?: string
          expires_at?: string
          id?: string
          request_id?: string
          token?: string
          updated_at?: string
          used_at?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_tokens_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_tokens_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      seniors: {
        Row: {
          address_line1: string
          address_line2: string | null
          archived_at: string | null
          city: string
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          lat: number | null
          lng: number | null
          notes: string | null
          phone: string
          postal_code: string
          province: string
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          archived_at?: string | null
          city: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          phone: string
          postal_code: string
          province: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          archived_at?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          phone?: string
          postal_code?: string
          province?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seniors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          assigned_volunteer_id: string | null
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["request_priority"]
          requested_date: string
          senior_id: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          assigned_volunteer_id?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["request_priority"]
          requested_date: string
          senior_id: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          assigned_volunteer_id?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["request_priority"]
          requested_date?: string
          senior_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_assigned_volunteer_id_fkey"
            columns: ["assigned_volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_senior_id_fkey"
            columns: ["senior_id"]
            isOneToOne: false
            referencedRelation: "seniors"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sessions: {
        Row: {
          cost: number | null
          created_at: string
          distance_km: number | null
          end_lat: number | null
          end_lng: number | null
          ended_at: string | null
          id: string
          notes: string | null
          request_id: string
          start_lat: number | null
          start_lng: number | null
          started_at: string
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          distance_km?: number | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          request_id: string
          start_lat?: number | null
          start_lng?: number | null
          started_at: string
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          distance_km?: number | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          request_id?: string
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_sessions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_sessions_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      volunteers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auth_provider: Database["public"]["Enums"]["auth_provider"]
          categories: string[]
          created_at: string
          email: string
          first_name: string
          home_address: string | null
          home_lat: number | null
          home_lng: number | null
          id: string
          last_name: string
          phone: string | null
          service_area: string | null
          signup_source: string | null
          status: Database["public"]["Enums"]["volunteer_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auth_provider: Database["public"]["Enums"]["auth_provider"]
          categories?: string[]
          created_at?: string
          email: string
          first_name: string
          home_address?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id: string
          last_name: string
          phone?: string | null
          service_area?: string | null
          signup_source?: string | null
          status?: Database["public"]["Enums"]["volunteer_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auth_provider?: Database["public"]["Enums"]["auth_provider"]
          categories?: string[]
          created_at?: string
          email?: string
          first_name?: string
          home_address?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          last_name?: string
          phone?: string | null
          service_area?: string | null
          signup_source?: string | null
          status?: Database["public"]["Enums"]["volunteer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_senior_cascade: {
        Args: { p_senior_id: string }
        Returns: undefined
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
    }
    Enums: {
      auth_provider: "email" | "google" | "admin_invite"
      notification_channel: "email" | "sms" | "push"
      notification_status: "sent" | "failed" | "bounced"
      request_priority: "low" | "normal" | "high"
      request_status:
        | "open"
        | "notified"
        | "accepted"
        | "completed"
        | "cancelled"
      token_action: "accept" | "decline" | "superseded"
      volunteer_status: "pending" | "active" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      auth_provider: ["email", "google", "admin_invite"],
      notification_channel: ["email", "sms", "push"],
      notification_status: ["sent", "failed", "bounced"],
      request_priority: ["low", "normal", "high"],
      request_status: [
        "open",
        "notified",
        "accepted",
        "completed",
        "cancelled",
      ],
      token_action: ["accept", "decline", "superseded"],
      volunteer_status: ["pending", "active", "inactive"],
    },
  },
} as const


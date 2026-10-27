export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          detail: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string
          id?: string
          status: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_automation_settings: {
        Row: {
          user_id: string
          enabled: boolean
          mode: string
          trigger_keyword: string
          reply_instruction: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          enabled?: boolean
          mode?: string
          trigger_keyword?: string
          reply_instruction?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          enabled?: boolean
          mode?: string
          trigger_keyword?: string
          reply_instruction?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      instagram_reply_drafts: {
        Row: {
          id: string
          user_id: string
          comment_id: string
          media_id: string
          commenter_username: string
          comment_text: string
          suggested_reply: string
          status: string
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          comment_id: string
          media_id?: string
          commenter_username?: string
          comment_text?: string
          suggested_reply: string
          status?: string
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          comment_id?: string
          media_id?: string
          commenter_username?: string
          comment_text?: string
          suggested_reply?: string
          status?: string
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      instagram_webhook_events: {
        Row: {
          event_key: string
          user_id: string | null
          event_type: string
          status: string
          error_message: string | null
          created_at: string
          processed_at: string | null
        }
        Insert: {
          event_key: string
          user_id?: string | null
          event_type?: string
          status?: string
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
        }
        Update: {
          event_key?: string
          user_id?: string | null
          event_type?: string
          status?: string
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
        }
        Relationships: []
      }
      instagram_connections: {
        Row: {
          account_type: string | null
          created_at: string
          ig_user_id: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          ig_user_id: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          account_type?: string | null
          created_at?: string
          ig_user_id?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      instagram_tokens: {
        Row: {
          access_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_api_keys: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          scopes: string[]
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          scopes?: string[]
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          scopes?: string[]
          state?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      api_keys: {
        Row: {
          allowed_campaign_ids: Json;
          allowed_character_ids: Json;
          created_at: string | null;
          id: string;
          key_hash: string;
          label: string;
          last_used_at: string | null;
          owner_id: string;
          revoked_at: string | null;
          scopes: Json;
        };
        Insert: {
          allowed_campaign_ids?: Json;
          allowed_character_ids?: Json;
          created_at?: string | null;
          id?: string;
          key_hash: string;
          label: string;
          last_used_at?: string | null;
          owner_id: string;
          revoked_at?: string | null;
          scopes?: Json;
        };
        Update: {
          allowed_campaign_ids?: Json;
          allowed_character_ids?: Json;
          created_at?: string | null;
          id?: string;
          key_hash?: string;
          label?: string;
          last_used_at?: string | null;
          owner_id?: string;
          revoked_at?: string | null;
          scopes?: Json;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          actor_id: string | null;
          campaign_id: string | null;
          character_id: string | null;
          created_at: string | null;
          event_data: Json;
          event_type: string;
          id: string;
          ip_hash: string | null;
          user_agent: string | null;
        };
        Insert: {
          actor_id?: string | null;
          campaign_id?: string | null;
          character_id?: string | null;
          created_at?: string | null;
          event_data?: Json;
          event_type: string;
          id?: string;
          ip_hash?: string | null;
          user_agent?: string | null;
        };
        Update: {
          actor_id?: string | null;
          campaign_id?: string | null;
          character_id?: string | null;
          created_at?: string | null;
          event_data?: Json;
          event_type?: string;
          id?: string;
          ip_hash?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      campaign_characters: {
        Row: {
          added_by: string | null;
          approved_snapshot_id: string | null;
          campaign_id: string;
          character_id: string;
          created_at: string | null;
          gm_review_status: string;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          added_by?: string | null;
          approved_snapshot_id?: string | null;
          campaign_id: string;
          character_id: string;
          created_at?: string | null;
          gm_review_status?: string;
          id?: string;
          updated_at?: string | null;
        };
        Update: {
          added_by?: string | null;
          approved_snapshot_id?: string | null;
          campaign_id?: string;
          character_id?: string;
          created_at?: string | null;
          gm_review_status?: string;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      campaign_members: {
        Row: {
          campaign_id: string;
          created_at: string | null;
          id: string;
          role: string;
          status: string;
          user_id: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string | null;
          id?: string;
          role: string;
          status?: string;
          user_id: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string | null;
          id?: string;
          role?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          created_at: string | null;
          description: string | null;
          enabled_modules: Json;
          id: string;
          name: string;
          owner_id: string;
          public_slug: string | null;
          settings: Json;
          system_key: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          enabled_modules?: Json;
          id?: string;
          name: string;
          owner_id: string;
          public_slug?: string | null;
          settings?: Json;
          system_key?: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          enabled_modules?: Json;
          id?: string;
          name?: string;
          owner_id?: string;
          public_slug?: string | null;
          settings?: Json;
          system_key?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      character_collaborators: {
        Row: {
          character_id: string;
          created_at: string | null;
          granted_by: string | null;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          character_id: string;
          created_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role: string;
          user_id: string;
        };
        Update: {
          character_id?: string;
          created_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      character_comments: {
        Row: {
          author_id: string;
          body: string;
          campaign_id: string | null;
          character_id: string;
          created_at: string | null;
          id: string;
          status: string;
          target_path: string | null;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          body: string;
          campaign_id?: string | null;
          character_id: string;
          created_at?: string | null;
          id?: string;
          status?: string;
          target_path?: string | null;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          body?: string;
          campaign_id?: string | null;
          character_id?: string;
          created_at?: string | null;
          id?: string;
          status?: string;
          target_path?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      character_snapshots: {
        Row: {
          character_id: string;
          computed_summary: Json;
          computed_values: Json;
          created_at: string | null;
          created_by: string | null;
          diff_from_previous: Json | null;
          id: string;
          label: string;
          reason: string | null;
          sheet_data: Json;
        };
        Insert: {
          character_id: string;
          computed_summary?: Json;
          computed_values?: Json;
          created_at?: string | null;
          created_by?: string | null;
          diff_from_previous?: Json | null;
          id?: string;
          label: string;
          reason?: string | null;
          sheet_data: Json;
        };
        Update: {
          character_id?: string;
          computed_summary?: Json;
          computed_values?: Json;
          created_at?: string | null;
          created_by?: string | null;
          diff_from_previous?: Json | null;
          id?: string;
          label?: string;
          reason?: string | null;
          sheet_data?: Json;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          active_theme: Json;
          computed_summary: Json;
          computed_values: Json;
          created_at: string | null;
          enabled_modules: Json;
          id: string;
          is_archived: boolean;
          last_calculated_at: string | null;
          name: string;
          owner_id: string;
          privacy_map: Json;
          public_slug: string | null;
          schema_version: string;
          sheet_data: Json;
          system_key: string;
          updated_at: string | null;
          visibility: string;
        };
        Insert: {
          active_theme?: Json;
          computed_summary?: Json;
          computed_values?: Json;
          created_at?: string | null;
          enabled_modules?: Json;
          id?: string;
          is_archived?: boolean;
          last_calculated_at?: string | null;
          name?: string;
          owner_id: string;
          privacy_map?: Json;
          public_slug?: string | null;
          schema_version?: string;
          sheet_data: Json;
          system_key?: string;
          updated_at?: string | null;
          visibility?: string;
        };
        Update: {
          active_theme?: Json;
          computed_summary?: Json;
          computed_values?: Json;
          created_at?: string | null;
          enabled_modules?: Json;
          id?: string;
          is_archived?: boolean;
          last_calculated_at?: string | null;
          name?: string;
          owner_id?: string;
          privacy_map?: Json;
          public_slug?: string | null;
          schema_version?: string;
          sheet_data?: Json;
          system_key?: string;
          updated_at?: string | null;
          visibility?: string;
        };
        Relationships: [];
      };
      content_packs: {
        Row: {
          created_at: string | null;
          id: string;
          key: string;
          license: string | null;
          manifest: Json;
          name: string;
          owner_id: string | null;
          publisher: string | null;
          status: string;
          system_key: string;
          updated_at: string | null;
          version: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          key: string;
          license?: string | null;
          manifest: Json;
          name: string;
          owner_id?: string | null;
          publisher?: string | null;
          status?: string;
          system_key?: string;
          updated_at?: string | null;
          version: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          key?: string;
          license?: string | null;
          manifest?: Json;
          name?: string;
          owner_id?: string | null;
          publisher?: string | null;
          status?: string;
          system_key?: string;
          updated_at?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      export_jobs: {
        Row: {
          character_id: string;
          created_at: string | null;
          errors: Json;
          export_type: string;
          file_path: string | null;
          id: string;
          metadata: Json;
          owner_id: string;
          status: string;
          updated_at: string | null;
        };
        Insert: {
          character_id: string;
          created_at?: string | null;
          errors?: Json;
          export_type: string;
          file_path?: string | null;
          id?: string;
          metadata?: Json;
          owner_id: string;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          character_id?: string;
          created_at?: string | null;
          errors?: Json;
          export_type?: string;
          file_path?: string | null;
          id?: string;
          metadata?: Json;
          owner_id?: string;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      gm_notes: {
        Row: {
          author_id: string;
          body: string;
          campaign_id: string;
          character_id: string;
          created_at: string | null;
          id: string;
          updated_at: string | null;
          visibility: string;
        };
        Insert: {
          author_id: string;
          body: string;
          campaign_id: string;
          character_id: string;
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
          visibility?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          campaign_id?: string;
          character_id?: string;
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
          visibility?: string;
        };
        Relationships: [];
      };
      gm_reviews: {
        Row: {
          campaign_id: string;
          character_id: string;
          checklist: Json;
          created_at: string | null;
          id: string;
          reviewer_id: string;
          status: string;
          summary: string | null;
          updated_at: string | null;
        };
        Insert: {
          campaign_id: string;
          character_id: string;
          checklist?: Json;
          created_at?: string | null;
          id?: string;
          reviewer_id: string;
          status: string;
          summary?: string | null;
          updated_at?: string | null;
        };
        Update: {
          campaign_id?: string;
          character_id?: string;
          checklist?: Json;
          created_at?: string | null;
          id?: string;
          reviewer_id?: string;
          status?: string;
          summary?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          character_id: string | null;
          created_at: string | null;
          errors: Json;
          id: string;
          mapping_preview: Json;
          original_filename: string | null;
          owner_id: string;
          source_metadata: Json;
          source_type: string;
          status: string;
          updated_at: string | null;
          warnings: Json;
        };
        Insert: {
          character_id?: string | null;
          created_at?: string | null;
          errors?: Json;
          id?: string;
          mapping_preview?: Json;
          original_filename?: string | null;
          owner_id: string;
          source_metadata?: Json;
          source_type: string;
          status?: string;
          updated_at?: string | null;
          warnings?: Json;
        };
        Update: {
          character_id?: string | null;
          created_at?: string | null;
          errors?: Json;
          id?: string;
          mapping_preview?: Json;
          original_filename?: string | null;
          owner_id?: string;
          source_metadata?: Json;
          source_type?: string;
          status?: string;
          updated_at?: string | null;
          warnings?: Json;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id: string;
          updated_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      rule_modules: {
        Row: {
          conflicts: Json;
          content_pack_id: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          key: string;
          manifest: Json;
          module_type: string;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          conflicts?: Json;
          content_pack_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          key: string;
          manifest: Json;
          module_type: string;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          conflicts?: Json;
          content_pack_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          key?: string;
          manifest?: Json;
          module_type?: string;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      share_links: {
        Row: {
          allowed_sections: Json;
          character_id: string;
          created_at: string | null;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          label: string | null;
          revoked_at: string | null;
          slug: string | null;
          token_hash: string;
          visibility_preset: string;
        };
        Insert: {
          allowed_sections?: Json;
          character_id: string;
          created_at?: string | null;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          revoked_at?: string | null;
          slug?: string | null;
          token_hash: string;
          visibility_preset?: string;
        };
        Update: {
          allowed_sections?: Json;
          character_id?: string;
          created_at?: string | null;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          revoked_at?: string | null;
          slug?: string | null;
          token_hash?: string;
          visibility_preset?: string;
        };
        Relationships: [];
      };
      spell_compendium: {
        Row: {
          area: string | null;
          bloodline_levels: Json | null;
          casting_time: string | null;
          class_levels: Json;
          components: string | null;
          created_at: string | null;
          description: string | null;
          descriptor: string | null;
          domain_levels: Json | null;
          duration: string | null;
          effect: string | null;
          id: string;
          name: string;
          range: string | null;
          saving_throw: string | null;
          school: string;
          search_vector: unknown;
          source: string | null;
          spell_resistance: string | null;
          subschool: string | null;
          targets: string | null;
        };
        Insert: {
          area?: string | null;
          bloodline_levels?: Json | null;
          casting_time?: string | null;
          class_levels?: Json;
          components?: string | null;
          created_at?: string | null;
          description?: string | null;
          descriptor?: string | null;
          domain_levels?: Json | null;
          duration?: string | null;
          effect?: string | null;
          id?: string;
          name: string;
          range?: string | null;
          saving_throw?: string | null;
          school?: string;
          search_vector?: unknown;
          source?: string | null;
          spell_resistance?: string | null;
          subschool?: string | null;
          targets?: string | null;
        };
        Update: {
          area?: string | null;
          bloodline_levels?: Json | null;
          casting_time?: string | null;
          class_levels?: Json;
          components?: string | null;
          created_at?: string | null;
          description?: string | null;
          descriptor?: string | null;
          domain_levels?: Json | null;
          duration?: string | null;
          effect?: string | null;
          id?: string;
          name?: string;
          range?: string | null;
          saving_throw?: string | null;
          school?: string;
          search_vector?: unknown;
          source?: string | null;
          spell_resistance?: string | null;
          subschool?: string | null;
          targets?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_edit_character: {
        Args: { p_character_id: string; p_user_id: string };
        Returns: boolean;
      };
      can_gm_review_character: {
        Args: { p_campaign_id: string; p_character_id: string; p_user_id: string };
        Returns: boolean;
      };
      can_view_character: {
        Args: { p_character_id: string; p_user_id: string };
        Returns: boolean;
      };
      has_campaign_role: {
        Args: { p_campaign_id: string; p_roles: string[]; p_user_id: string };
        Returns: boolean;
      };
      has_character_any_role: {
        Args: { p_character_id: string; p_roles: string[]; p_user_id: string };
        Returns: boolean;
      };
      has_character_role: {
        Args: { p_character_id: string; p_role: string; p_user_id: string };
        Returns: boolean;
      };
      is_campaign_member: {
        Args: { p_campaign_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_character_owner: {
        Args: { p_character_id: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

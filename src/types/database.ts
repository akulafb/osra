// TypeScript types for Supabase database schema
// These should match your actual Supabase table structure

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string; // UUID from auth.users
          node_id: string | null; // UUID - bound family node
          role: 'admin' | 'user';
          full_name: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id: string; // UUID from auth.users
          node_id?: string | null;
          role?: 'admin' | 'user';
          full_name?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string; // UUID from auth.users
          node_id?: string | null;
          role?: 'admin' | 'user';
          full_name?: string | null;
          email?: string | null;
          created_at?: string;
        };
      };
      nodes: {
        Row: {
          id: string; // UUID
          first_name: string;
          paternal_family_cluster: string | null;
          maternal_family_cluster: string | null;
          created_by_user_id: string | null; // UUID from auth.users
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          paternal_family_cluster?: string | null;
          maternal_family_cluster?: string | null;
          created_by_user_id?: string | null; // UUID from auth.users
          created_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          paternal_family_cluster?: string | null;
          maternal_family_cluster?: string | null;
          created_by_user_id?: string | null; // UUID from auth.users
          created_at?: string;
        };
      };
      links: {
        Row: {
          id: string; // UUID
          source_node_id: string; // UUID
          target_node_id: string; // UUID
          type: 'parent' | 'marriage' | 'divorce';
          parent_role: 'mother' | 'father' | null;
          created_by_user_id: string | null; // UUID from auth.users
          created_at: string;
        };
        Insert: {
          id?: string;
          source_node_id: string;
          target_node_id: string;
          type: 'parent' | 'marriage' | 'divorce';
          parent_role?: 'mother' | 'father' | null;
          created_by_user_id?: string | null; // UUID from auth.users
          created_at?: string;
        };
        Update: {
          id?: string;
          source_node_id?: string;
          target_node_id?: string;
          type?: 'parent' | 'marriage' | 'divorce';
          parent_role?: 'mother' | 'father' | null;
          created_by_user_id?: string | null; // UUID from auth.users
          created_at?: string;
        };
      };
      node_invites: {
        Row: {
          id: string; // UUID
          node_id: string; // UUID
          token: string; // Unique invite token
          expires_at: string;
          claimed_by_user_id: string | null; // UUID from auth.users
          created_by_user_id: string | null; // UUID from auth.users
          created_at: string;
        };
        Insert: {
          id?: string;
          node_id: string;
          token: string;
          expires_at: string;
          claimed_by_user_id?: string | null; // UUID from auth.users
          created_by_user_id?: string | null; // UUID from auth.users
          created_at?: string;
        };
        Update: {
          id?: string;
          node_id?: string;
          token?: string;
          expires_at?: string;
          claimed_by_user_id?: string | null; // UUID from auth.users
          created_by_user_id?: string | null; // UUID from auth.users
          created_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string; // UUID
          actor_user_id: string | null; // UUID from auth.users
          action: string;
          target_node_id: string | null; // UUID
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null; // UUID from auth.users
          action: string;
          target_node_id?: string | null; // UUID
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string | null; // UUID from auth.users
          action?: string;
          target_node_id?: string | null; // UUID
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_within_1_degree: {
        Args: {
          target_node_id: string;
        };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_invite_by_token: {
        Args: {
          invite_token: string;
        };
        Returns: {
          token: string;
          node_id: string;
          expires_at: string;
          claimed_by_user_id: string | null;
          node_name: string;
        } | null;
      };
      claim_invite_secure: {
        Args: {
          invite_token: string;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
          node_id?: string;
        };
      };
      create_relative_secure: {
        Args: {
          new_first_name: string;
          rel_type: string;
          target_node_id: string;
          creator_id: string;
          p_parent_role?: string | null;
          /** Caller-supplied Person uuid; the database mints one when omitted. */
          p_new_node_id?: string | null;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
          new_node_id?: string;
          /** The `public.nodes` row written, so the caller can confirm it. */
          nodes?: Database['public']['Tables']['nodes']['Row'][];
          /** Every `public.links` row written — `sibling` writes one per parent. */
          links?: Database['public']['Tables']['links']['Row'][];
        };
      };
      link_existing_relative_secure: {
        Args: {
          existing_node_id: string;
          rel_type: string;
          target_node_id: string;
          creator_id: string;
          p_parent_role?: string | null;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
          new_node_id?: string;
          /** Accepted having inserted nothing; `links` is then empty. */
          already_connected?: boolean;
          links?: Database['public']['Tables']['links']['Row'][];
        };
      };
      admin_delete_node_secure: {
        Args: {
          p_node_id: string;
        };
        Returns: {
          success: boolean;
          message?: string;
          /** The Kinship Links the FK cascade took with the Person. */
          removed_link_ids?: string[];
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

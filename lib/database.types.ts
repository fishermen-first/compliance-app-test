export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: { id: string; name: string; timezone: string; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; timezone?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; timezone?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; full_name: string; email: string; created_at: string; updated_at: string };
        Insert: { id: string; full_name: string; email: string; created_at?: string; updated_at?: string };
        Update: { id?: string; full_name?: string; email?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      company_memberships: {
        Row: { id: string; company_id: string; user_id: string; role: Database['public']['Enums']['app_role']; created_at: string };
        Insert: { id?: string; company_id: string; user_id: string; role?: Database['public']['Enums']['app_role']; created_at?: string };
        Update: { id?: string; company_id?: string; user_id?: string; role?: Database['public']['Enums']['app_role']; created_at?: string };
        Relationships: [];
      };
      vessels: {
        Row: { id: string; company_id: string; name: string; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; company_id: string; name: string; active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; company_id?: string; name?: string; active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      compliance_events: {
        Row: {
          id: string;
          company_id: string;
          vessel_id: string | null;
          owner_id: string | null;
          title: string;
          category: Database['public']['Enums']['event_category'];
          priority: Database['public']['Enums']['event_priority'];
          status: Database['public']['Enums']['compliance_status'];
          due_at: string;
          notes: string | null;
          sharepoint_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          vessel_id?: string | null;
          owner_id?: string | null;
          title: string;
          category?: Database['public']['Enums']['event_category'];
          priority?: Database['public']['Enums']['event_priority'];
          status?: Database['public']['Enums']['compliance_status'];
          due_at: string;
          notes?: string | null;
          sharepoint_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          vessel_id?: string | null;
          owner_id?: string | null;
          title?: string;
          category?: Database['public']['Enums']['event_category'];
          priority?: Database['public']['Enums']['event_priority'];
          status?: Database['public']['Enums']['compliance_status'];
          due_at?: string;
          notes?: string | null;
          sharepoint_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      app_role: 'owner' | 'office_admin' | 'office_user' | 'vessel_user';
      compliance_status: 'draft' | 'active' | 'waiting_on_vessel' | 'office_review' | 'complete' | 'archived';
      event_priority: 'low' | 'medium' | 'high';
      event_category: 'inspection' | 'report' | 'audit' | 'permit' | 'training' | 'other';
      reminder_status: 'scheduled' | 'queued' | 'sent' | 'failed' | 'skipped';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

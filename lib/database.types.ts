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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_admins: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          vessel_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          vessel_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      company_import_runs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          imported_by: string | null
          owner_code_count: number
          record_count: number
          sheet_name: string
          vessel_count: number
          warning_count: number
          workbook_name: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          imported_by?: string | null
          owner_code_count?: number
          record_count?: number
          sheet_name: string
          vessel_count?: number
          warning_count?: number
          workbook_name?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          imported_by?: string | null
          owner_code_count?: number
          record_count?: number
          sheet_name?: string
          vessel_count?: number
          warning_count?: number
          workbook_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_import_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_import_runs_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_import_warnings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          import_run_id: string
          issue: string
          row_number: number | null
          severity: string
          value: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          import_run_id: string
          issue: string
          row_number?: number | null
          severity?: string
          value?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          import_run_id?: string
          issue?: string
          row_number?: number | null
          severity?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_import_warnings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_import_warnings_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_owner_codes: {
        Row: {
          code: string
          company_id: string
          created_at: string
          display_name: string | null
          handoff_exempt: boolean
          handoff_exempted_at: string | null
          handoff_exempted_by: string | null
          handoff_exemption_reason: string | null
          id: string
          pending_email: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          display_name?: string | null
          handoff_exempt?: boolean
          handoff_exempted_at?: string | null
          handoff_exempted_by?: string | null
          handoff_exemption_reason?: string | null
          id?: string
          pending_email?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          display_name?: string | null
          handoff_exempt?: boolean
          handoff_exempted_at?: string | null
          handoff_exempted_by?: string | null
          handoff_exemption_reason?: string | null
          id?: string
          pending_email?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_owner_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_owner_codes_handoff_exempted_by_fkey"
            columns: ["handoff_exempted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_owner_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_events: {
        Row: {
          category: Database["public"]["Enums"]["event_category"]
          company_id: string
          created_at: string
          created_by: string | null
          due_at: string
          id: string
          notes: string | null
          owner_id: string | null
          priority: Database["public"]["Enums"]["event_priority"]
          sharepoint_url: string | null
          status: Database["public"]["Enums"]["compliance_status"]
          title: string
          updated_at: string
          vessel_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["event_category"]
          company_id: string
          created_at?: string
          created_by?: string | null
          due_at: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["event_priority"]
          sharepoint_url?: string | null
          status?: Database["public"]["Enums"]["compliance_status"]
          title: string
          updated_at?: string
          vessel_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["event_category"]
          company_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["event_priority"]
          sharepoint_url?: string | null
          status?: Database["public"]["Enums"]["compliance_status"]
          title?: string
          updated_at?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_events_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_item_notification_recipients: {
        Row: {
          company_id: string
          created_at: string
          id: string
          item_id: string
          recipient_email: string
          recipient_name: string | null
          recipient_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          item_id: string
          recipient_email: string
          recipient_name?: string | null
          recipient_type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string
          recipient_email?: string
          recipient_name?: string | null
          recipient_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_item_notification_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_notification_recipients_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_item_reminder_rules: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          days_before: number | null
          id: string
          item_id: string
          label: string
          repeat_every_days: number | null
          trigger_type: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          days_before?: number | null
          id?: string
          item_id: string
          label: string
          repeat_every_days?: number | null
          trigger_type: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          days_before?: number | null
          id?: string
          item_id?: string
          label?: string
          repeat_every_days?: number | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_item_reminder_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_reminder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_item_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string
          from_status:
            | Database["public"]["Enums"]["compliance_item_status"]
            | null
          id: string
          item_id: string
          notes: string | null
          to_status: Database["public"]["Enums"]["compliance_item_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id: string
          from_status?:
            | Database["public"]["Enums"]["compliance_item_status"]
            | null
          id?: string
          item_id: string
          notes?: string | null
          to_status: Database["public"]["Enums"]["compliance_item_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          from_status?:
            | Database["public"]["Enums"]["compliance_item_status"]
            | null
          id?: string
          item_id?: string
          notes?: string | null
          to_status?: Database["public"]["Enums"]["compliance_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "compliance_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_status_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items: {
        Row: {
          agency_type: string | null
          company_id: string
          completed_at: string | null
          compliance_area: string
          created_at: string
          created_by: string | null
          discontinued_at: string | null
          expiration_date: string | null
          frequency_label: string | null
          id: string
          instructions: string | null
          item_name: string
          item_number: string | null
          owner_current: string | null
          owner_raw: string | null
          previous_item_id: string | null
          recurrence_interval: number | null
          recurrence_unit: Database["public"]["Enums"]["recurrence_unit"]
          sharepoint_url: string | null
          source_row_number: number | null
          source_sheet: string | null
          start_working_on: string | null
          status: Database["public"]["Enums"]["compliance_item_status"]
          status_notes: string | null
          updated_at: string
          vessel_id: string | null
        }
        Insert: {
          agency_type?: string | null
          company_id: string
          completed_at?: string | null
          compliance_area?: string
          created_at?: string
          created_by?: string | null
          discontinued_at?: string | null
          expiration_date?: string | null
          frequency_label?: string | null
          id?: string
          instructions?: string | null
          item_name: string
          item_number?: string | null
          owner_current?: string | null
          owner_raw?: string | null
          previous_item_id?: string | null
          recurrence_interval?: number | null
          recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
          sharepoint_url?: string | null
          source_row_number?: number | null
          source_sheet?: string | null
          start_working_on?: string | null
          status?: Database["public"]["Enums"]["compliance_item_status"]
          status_notes?: string | null
          updated_at?: string
          vessel_id?: string | null
        }
        Update: {
          agency_type?: string | null
          company_id?: string
          completed_at?: string | null
          compliance_area?: string
          created_at?: string
          created_by?: string | null
          discontinued_at?: string | null
          expiration_date?: string | null
          frequency_label?: string | null
          id?: string
          instructions?: string | null
          item_name?: string
          item_number?: string | null
          owner_current?: string | null
          owner_raw?: string | null
          previous_item_id?: string | null
          recurrence_interval?: number | null
          recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
          sharepoint_url?: string | null
          source_row_number?: number | null
          source_sheet?: string | null
          start_working_on?: string | null
          status?: Database["public"]["Enums"]["compliance_item_status"]
          status_notes?: string | null
          updated_at?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_items_previous_item_id_fkey"
            columns: ["previous_item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_items_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          company_id: string
          created_at: string
          event_id: string | null
          failure_reason: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          subject: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          subject: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "compliance_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminder_rules: {
        Row: {
          created_at: string
          days_before: number
          event_id: string
          id: string
          send_time: string
        }
        Insert: {
          created_at?: string
          days_before: number
          event_id: string
          id?: string
          send_time?: string
        }
        Update: {
          created_at?: string
          days_before?: number
          event_id?: string
          id?: string
          send_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_rules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "compliance_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminder_send_log: {
        Row: {
          body: string
          company_id: string
          created_at: string
          failure_reason: string | null
          id: string
          item_id: string | null
          provider_message_id: string | null
          recipient_email: string
          reminder_rule_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          subject: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          item_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          reminder_rule_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          subject: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          item_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          reminder_rule_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_send_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_send_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_send_log_reminder_rule_id_fkey"
            columns: ["reminder_rule_id"]
            isOneToOne: false
            referencedRelation: "compliance_item_reminder_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_contacts: {
        Row: {
          can_acknowledge: boolean
          created_at: string
          id: string
          user_id: string
          vessel_id: string
        }
        Insert: {
          can_acknowledge?: boolean
          created_at?: string
          id?: string
          user_id: string
          vessel_id: string
        }
        Update: {
          can_acknowledge?: boolean
          created_at?: string
          id?: string
          user_id?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vessel_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessel_contacts_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      vessels: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vessels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_company_invite: { Args: { full_name?: string }; Returns: string | null }
      can_manage_compliance_item: {
        Args: { target_item_id: string }
        Returns: boolean
      }
      complete_compliance_item: {
        Args: {
          completion_date: string
          final_notes?: string
          next_expiration_date?: string
          next_start_working_on?: string
          should_create_next?: boolean
          target_item_id: string
        }
        Returns: string
      }
      create_company_workspace: {
        Args: { company_name: string; full_name: string }
        Returns: string
      }
      create_compliance_event: {
        Args: {
          event_category?: Database["public"]["Enums"]["event_category"]
          event_due_at: string
          event_notes?: string
          event_priority?: Database["public"]["Enums"]["event_priority"]
          event_sharepoint_url?: string
          event_status?: Database["public"]["Enums"]["compliance_status"]
          event_title: string
          event_vessel_id?: string
        }
        Returns: string
      }
      create_compliance_item: {
        Args: {
          item_agency_type?: string
          item_compliance_area?: string
          item_expiration_date?: string
          item_frequency_label?: string
          item_instructions?: string
          item_name?: string
          item_number?: string
          item_owner_current?: string
          item_owner_raw?: string
          item_recurrence_interval?: number
          item_recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
          item_sharepoint_url?: string
          item_start_working_on?: string
          item_status_notes?: string
          target_company_id: string
          target_vessel_id?: string
        }
        Returns: string
      }
      create_default_reminder_rules: {
        Args: { target_item_id: string }
        Returns: undefined
      }
      current_user_email: { Args: never; Returns: string }
      get_queue_owner_codes: {
        Args: { target_company_id: string }
        Returns: {
          code: string
          display_name: string | null
          records: number
          is_assigned_to_current_user: boolean
          is_visible_to_current_user: boolean
        }[]
      }
      has_company_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          target_company_id: string
        }
        Returns: boolean
      }
      is_app_admin: { Args: never; Returns: boolean }
      is_company_member: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      import_compliance_workbook_records: {
        Args: {
          records: Json
          target_company_id: string
          target_sheet: string
        }
        Returns: number
      }
      save_initial_vessels: {
        Args: { vessel_names: string[] }
        Returns: undefined
      }
      save_compliance_item_reminders: {
        Args: {
          additional_recipients: Json
          expiration_days_before: number
          expiration_rule_active: boolean
          item_instructions: string | null
          repeat_every_days: number | null
          repeat_rule_active: boolean
          start_rule_active: boolean
          target_item_id: string
        }
        Returns: undefined
      }
      schedule_due_reminders: {
        Args: { target_company_id: string; target_run_date?: string }
        Returns: number
      }
      settings_cancel_pending_invite: {
        Args: { target_company_id: string; target_invitation_id: string }
        Returns: undefined
      }
      settings_get_access_rows: {
        Args: { target_company_id: string }
        Returns: {
          target_kind: string
          target_id: string
          email: string | null
          display_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          owner_codes: string[]
          app_admin_contamination: boolean
          can_update_role: boolean
          can_remove: boolean
          can_cancel: boolean
          can_update_owner_codes: boolean
          can_clear_owner_codes: boolean
          created_at: string
        }[]
      }
      settings_remove_member_access: {
        Args: { target_company_id: string; target_membership_id: string }
        Returns: undefined
      }
      settings_update_member_access: {
        Args: {
          target_company_id: string
          target_membership_id: string
          next_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      settings_update_owner_code_assignment: {
        Args: {
          target_company_id: string
          target_kind: string
          target_id: string
          owner_codes: string[]
        }
        Returns: undefined
      }
      settings_update_pending_invite_access: {
        Args: {
          target_company_id: string
          target_invitation_id: string
          next_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      update_compliance_item_status: {
        Args: {
          next_notes?: string
          next_status: Database["public"]["Enums"]["compliance_item_status"]
          target_item_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "office_admin" | "office_user" | "vessel_user"
      compliance_item_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "complete"
        | "discontinued"
      compliance_status:
        | "draft"
        | "active"
        | "waiting_on_vessel"
        | "office_review"
        | "complete"
        | "archived"
      event_category:
        | "inspection"
        | "report"
        | "audit"
        | "permit"
        | "training"
        | "other"
      event_priority: "low" | "medium" | "high"
      recurrence_unit: "years" | "months" | "manual" | "none"
      reminder_status: "scheduled" | "queued" | "sent" | "failed" | "skipped"
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
  public: {
    Enums: {
      app_role: ["owner", "office_admin", "office_user", "vessel_user"],
      compliance_item_status: [
        "not_started",
        "in_progress",
        "submitted",
        "complete",
        "discontinued",
      ],
      compliance_status: [
        "draft",
        "active",
        "waiting_on_vessel",
        "office_review",
        "complete",
        "archived",
      ],
      event_category: [
        "inspection",
        "report",
        "audit",
        "permit",
        "training",
        "other",
      ],
      event_priority: ["low", "medium", "high"],
      recurrence_unit: ["years", "months", "manual", "none"],
      reminder_status: ["scheduled", "queued", "sent", "failed", "skipped"],
    },
  },
} as const

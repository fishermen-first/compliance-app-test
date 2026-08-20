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
      agencies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agencies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_aliases: {
        Row: {
          agency_id: string
          alias: string
          company_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          alias: string
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          alias?: string
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_aliases_agency_fk"
            columns: ["company_id", "agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "agency_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      company_import_runs: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_from_run_id: string | null
          applied_run_id: string | null
          company_id: string
          created_at: string
          detected_format: string | null
          id: string
          imported_by: string | null
          issue_count: number
          mode: string
          owner_code_count: number
          parser_version: string | null
          record_count: number
          safe_create_count: number
          safe_update_count: number
          sheet_name: string
          skipped_count: number
          status: string
          summary: Json
          template_version: string | null
          vessel_count: number
          warning_count: number
          workbook_name: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_from_run_id?: string | null
          applied_run_id?: string | null
          company_id: string
          created_at?: string
          detected_format?: string | null
          id?: string
          imported_by?: string | null
          issue_count?: number
          mode?: string
          owner_code_count?: number
          parser_version?: string | null
          record_count?: number
          safe_create_count?: number
          safe_update_count?: number
          sheet_name: string
          skipped_count?: number
          status?: string
          summary?: Json
          template_version?: string | null
          vessel_count?: number
          warning_count?: number
          workbook_name?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_from_run_id?: string | null
          applied_run_id?: string | null
          company_id?: string
          created_at?: string
          detected_format?: string | null
          id?: string
          imported_by?: string | null
          issue_count?: number
          mode?: string
          owner_code_count?: number
          parser_version?: string | null
          record_count?: number
          safe_create_count?: number
          safe_update_count?: number
          sheet_name?: string
          skipped_count?: number
          status?: string
          summary?: Json
          template_version?: string | null
          vessel_count?: number
          warning_count?: number
          workbook_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_import_runs_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_import_runs_applied_from_run_id_fkey"
            columns: ["applied_from_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_import_runs_applied_run_id_fkey"
            columns: ["applied_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
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
      company_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          display_name: string | null
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
          display_name?: string | null
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
          display_name?: string | null
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
      compliance_import_issues: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          details: Json
          id: string
          import_run_id: string
          import_run_row_id: string | null
          issue_type: string
          matched_item_id: string | null
          message: string
          severity: string
          source_row_number: number | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          details?: Json
          id?: string
          import_run_id: string
          import_run_row_id?: string | null
          issue_type: string
          matched_item_id?: string | null
          message: string
          severity?: string
          source_row_number?: number | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          details?: Json
          id?: string
          import_run_id?: string
          import_run_row_id?: string | null
          issue_type?: string
          matched_item_id?: string | null
          message?: string
          severity?: string
          source_row_number?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_import_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_issues_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_issues_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_issues_import_run_row_id_fkey"
            columns: ["import_run_row_id"]
            isOneToOne: false
            referencedRelation: "compliance_import_run_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_issues_matched_item_id_fkey"
            columns: ["matched_item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_import_run_rows: {
        Row: {
          company_id: string
          created_at: string
          id: string
          import_run_id: string
          is_safe_to_apply: boolean
          match_strategy: string | null
          matched_item_id: string | null
          normalized_agency_type: string | null
          normalized_item_name: string | null
          normalized_item_number: string | null
          normalized_owner_code: string | null
          normalized_period_label: string | null
          normalized_vessel_or_scope: string | null
          parsed_record: Json
          proposed_action: string
          resolved_agency_id: string | null
          resolved_vessel_id: string | null
          source_agency_type: string | null
          source_compliance_area: string | null
          source_expiration_date: string | null
          source_fingerprint: string
          source_frequency_label: string | null
          source_item_name: string | null
          source_item_number: string | null
          source_owner_code: string | null
          source_period_label: string | null
          source_recurrence_interval: number | null
          source_recurrence_unit:
            | Database["public"]["Enums"]["recurrence_unit"]
            | null
          source_row_hash: string | null
          source_row_json: Json
          source_row_number: number | null
          source_sheet: string | null
          source_start_working_on: string | null
          source_vessel_or_scope: string | null
          template_item_key: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          import_run_id: string
          is_safe_to_apply?: boolean
          match_strategy?: string | null
          matched_item_id?: string | null
          normalized_agency_type?: string | null
          normalized_item_name?: string | null
          normalized_item_number?: string | null
          normalized_owner_code?: string | null
          normalized_period_label?: string | null
          normalized_vessel_or_scope?: string | null
          parsed_record?: Json
          proposed_action?: string
          resolved_agency_id?: string | null
          resolved_vessel_id?: string | null
          source_agency_type?: string | null
          source_compliance_area?: string | null
          source_expiration_date?: string | null
          source_fingerprint: string
          source_frequency_label?: string | null
          source_item_name?: string | null
          source_item_number?: string | null
          source_owner_code?: string | null
          source_period_label?: string | null
          source_recurrence_interval?: number | null
          source_recurrence_unit?:
            | Database["public"]["Enums"]["recurrence_unit"]
            | null
          source_row_hash?: string | null
          source_row_json?: Json
          source_row_number?: number | null
          source_sheet?: string | null
          source_start_working_on?: string | null
          source_vessel_or_scope?: string | null
          template_item_key?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          import_run_id?: string
          is_safe_to_apply?: boolean
          match_strategy?: string | null
          matched_item_id?: string | null
          normalized_agency_type?: string | null
          normalized_item_name?: string | null
          normalized_item_number?: string | null
          normalized_owner_code?: string | null
          normalized_period_label?: string | null
          normalized_vessel_or_scope?: string | null
          parsed_record?: Json
          proposed_action?: string
          resolved_agency_id?: string | null
          resolved_vessel_id?: string | null
          source_agency_type?: string | null
          source_compliance_area?: string | null
          source_expiration_date?: string | null
          source_fingerprint?: string
          source_frequency_label?: string | null
          source_item_name?: string | null
          source_item_number?: string | null
          source_owner_code?: string | null
          source_period_label?: string | null
          source_recurrence_interval?: number | null
          source_recurrence_unit?:
            | Database["public"]["Enums"]["recurrence_unit"]
            | null
          source_row_hash?: string | null
          source_row_json?: Json
          source_row_number?: number | null
          source_sheet?: string | null
          source_start_working_on?: string | null
          source_vessel_or_scope?: string | null
          template_item_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_import_run_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_run_rows_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_run_rows_matched_item_id_fkey"
            columns: ["matched_item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_run_rows_resolved_agency_id_fkey"
            columns: ["resolved_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_import_run_rows_resolved_vessel_id_fkey"
            columns: ["resolved_vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_item_import_sources: {
        Row: {
          active: boolean
          company_id: string
          compliance_item_id: string
          first_import_run_id: string | null
          first_seen_at: string
          id: string
          last_import_run_id: string | null
          last_seen_at: string
          normalized_agency_type: string | null
          normalized_item_name: string | null
          normalized_item_number: string | null
          normalized_owner_code: string | null
          normalized_period_label: string | null
          normalized_vessel_or_scope: string | null
          source_fingerprint: string
          source_period_label: string | null
          source_row_hash: string | null
          source_row_json: Json
          source_row_number: number | null
          source_sheet: string | null
          template_item_key: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          compliance_item_id: string
          first_import_run_id?: string | null
          first_seen_at?: string
          id?: string
          last_import_run_id?: string | null
          last_seen_at?: string
          normalized_agency_type?: string | null
          normalized_item_name?: string | null
          normalized_item_number?: string | null
          normalized_owner_code?: string | null
          normalized_period_label?: string | null
          normalized_vessel_or_scope?: string | null
          source_fingerprint: string
          source_period_label?: string | null
          source_row_hash?: string | null
          source_row_json?: Json
          source_row_number?: number | null
          source_sheet?: string | null
          template_item_key?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          compliance_item_id?: string
          first_import_run_id?: string | null
          first_seen_at?: string
          id?: string
          last_import_run_id?: string | null
          last_seen_at?: string
          normalized_agency_type?: string | null
          normalized_item_name?: string | null
          normalized_item_number?: string | null
          normalized_owner_code?: string | null
          normalized_period_label?: string | null
          normalized_vessel_or_scope?: string | null
          source_fingerprint?: string
          source_period_label?: string | null
          source_row_hash?: string | null
          source_row_json?: Json
          source_row_number?: number | null
          source_sheet?: string | null
          template_item_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_item_import_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_import_sources_compliance_item_id_fkey"
            columns: ["compliance_item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_import_sources_first_import_run_id_fkey"
            columns: ["first_import_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_import_sources_last_import_run_id_fkey"
            columns: ["last_import_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_item_notification_recipients: {
        Row: {
          company_id: string
          contact_group_id: string | null
          created_at: string
          external_contact_id: string | null
          id: string
          item_id: string
          recipient_email: string
          recipient_name: string | null
          recipient_type: string
        }
        Insert: {
          company_id: string
          contact_group_id?: string | null
          created_at?: string
          external_contact_id?: string | null
          id?: string
          item_id: string
          recipient_email: string
          recipient_name?: string | null
          recipient_type?: string
        }
        Update: {
          company_id?: string
          contact_group_id?: string | null
          created_at?: string
          external_contact_id?: string | null
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
            foreignKeyName: "compliance_item_notification_recipients_contact_group_fk"
            columns: ["contact_group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_notification_recipients_external_contact_fk"
            columns: ["external_contact_id"]
            isOneToOne: false
            referencedRelation: "external_contacts"
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
      compliance_item_owner_codes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_primary: boolean
          item_id: string
          owner_code: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id: string
          owner_code: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id?: string
          owner_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_item_owner_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_item_owner_codes_item_id_fkey"
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
          audience: string
          company_id: string
          created_at: string
          days_before: number | null
          id: string
          item_id: string
          label: string
          repeat_every_days: number | null
          send_on: string | null
          trigger_type: string
        }
        Insert: {
          active?: boolean
          audience?: string
          company_id: string
          created_at?: string
          days_before?: number | null
          id?: string
          item_id: string
          label: string
          repeat_every_days?: number | null
          send_on?: string | null
          trigger_type: string
        }
        Update: {
          active?: boolean
          audience?: string
          company_id?: string
          created_at?: string
          days_before?: number | null
          id?: string
          item_id?: string
          label?: string
          repeat_every_days?: number | null
          send_on?: string | null
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
          agency_id: string | null
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
          last_import_action: string | null
          last_import_run_id: string | null
          last_imported_at: string | null
          last_non_import_activity_at: string | null
          owner_current: string | null
          owner_raw: string | null
          period_label: string | null
          previous_item_id: string | null
          recurrence_interval: number | null
          recurrence_unit: Database["public"]["Enums"]["recurrence_unit"]
          sharepoint_url: string | null
          source_agency_type: string | null
          source_compliance_area: string | null
          source_expiration_date: string | null
          source_frequency_label: string | null
          source_item_name: string | null
          source_item_number: string | null
          source_owner_code: string | null
          source_period_label: string | null
          source_recurrence_interval: number | null
          source_recurrence_unit:
            | Database["public"]["Enums"]["recurrence_unit"]
            | null
          source_row_hash: string | null
          source_row_json: Json | null
          source_row_number: number | null
          source_sheet: string | null
          source_start_working_on: string | null
          source_vessel_or_scope: string | null
          start_working_on: string | null
          status: Database["public"]["Enums"]["compliance_item_status"]
          status_notes: string | null
          template_item_key: string | null
          updated_at: string
          vessel_id: string | null
        }
        Insert: {
          agency_id?: string | null
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
          last_import_action?: string | null
          last_import_run_id?: string | null
          last_imported_at?: string | null
          last_non_import_activity_at?: string | null
          owner_current?: string | null
          owner_raw?: string | null
          period_label?: string | null
          previous_item_id?: string | null
          recurrence_interval?: number | null
          recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
          sharepoint_url?: string | null
          source_agency_type?: string | null
          source_compliance_area?: string | null
          source_expiration_date?: string | null
          source_frequency_label?: string | null
          source_item_name?: string | null
          source_item_number?: string | null
          source_owner_code?: string | null
          source_period_label?: string | null
          source_recurrence_interval?: number | null
          source_recurrence_unit?:
            | Database["public"]["Enums"]["recurrence_unit"]
            | null
          source_row_hash?: string | null
          source_row_json?: Json | null
          source_row_number?: number | null
          source_sheet?: string | null
          source_start_working_on?: string | null
          source_vessel_or_scope?: string | null
          start_working_on?: string | null
          status?: Database["public"]["Enums"]["compliance_item_status"]
          status_notes?: string | null
          template_item_key?: string | null
          updated_at?: string
          vessel_id?: string | null
        }
        Update: {
          agency_id?: string | null
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
          last_import_action?: string | null
          last_import_run_id?: string | null
          last_imported_at?: string | null
          last_non_import_activity_at?: string | null
          owner_current?: string | null
          owner_raw?: string | null
          period_label?: string | null
          previous_item_id?: string | null
          recurrence_interval?: number | null
          recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
          sharepoint_url?: string | null
          source_agency_type?: string | null
          source_compliance_area?: string | null
          source_expiration_date?: string | null
          source_frequency_label?: string | null
          source_item_name?: string | null
          source_item_number?: string | null
          source_owner_code?: string | null
          source_period_label?: string | null
          source_recurrence_interval?: number | null
          source_recurrence_unit?:
            | Database["public"]["Enums"]["recurrence_unit"]
            | null
          source_row_hash?: string | null
          source_row_json?: Json | null
          source_row_number?: number | null
          source_sheet?: string | null
          source_start_working_on?: string | null
          source_vessel_or_scope?: string | null
          start_working_on?: string | null
          status?: Database["public"]["Enums"]["compliance_item_status"]
          status_notes?: string | null
          template_item_key?: string | null
          updated_at?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_items_company_agency_fk"
            columns: ["company_id", "agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["company_id", "id"]
          },
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
            foreignKeyName: "compliance_items_last_import_run_id_fkey"
            columns: ["last_import_run_id"]
            isOneToOne: false
            referencedRelation: "company_import_runs"
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
      contact_group_members: {
        Row: {
          company_id: string
          created_at: string
          email: string
          group_id: string
          id: string
          name: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          group_id: string
          id?: string
          name?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          group_id?: string
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_group_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_group_members_group_fk"
            columns: ["company_id", "group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      external_contacts: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          claimed_at: string | null
          company_id: string
          created_at: string
          failure_reason: string | null
          id: string
          item_id: string | null
          provider_message_id: string | null
          recipient_email: string
          reminder_rule_id: string | null
          scheduled_for: string
          send_attempts: number
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          subject: string
        }
        Insert: {
          body: string
          claimed_at?: string | null
          company_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          item_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          reminder_rule_id?: string | null
          scheduled_for: string
          send_attempts?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          subject: string
        }
        Update: {
          body?: string
          claimed_at?: string | null
          company_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          item_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          reminder_rule_id?: string | null
          scheduled_for?: string
          send_attempts?: number
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
      workspace_tasks: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_to: string
          company_id: string
          compliance_item_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          details: string | null
          due_date: string | null
          id: string
          priority: string
          reminder_at: string | null
          reminder_dismissed_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_to: string
          company_id: string
          compliance_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          reminder_at?: string | null
          reminder_dismissed_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string
          company_id?: string
          compliance_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          reminder_at?: string | null
          reminder_dismissed_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tasks_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_compliance_item_id_fkey"
            columns: ["compliance_item_id"]
            isOneToOne: false
            referencedRelation: "compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      _apply_import_v3_resolutions: {
        Args: {
          decided_by?: string
          resolutions: Json
          target_import_run_id: string
        }
        Returns: undefined
      }
      _customer_settings_actor_role: {
        Args: { require_admin: boolean; target_company_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      _import_v3_resolve_agency: {
        Args: { target_company_id: string; value: string }
        Returns: string
      }
      _import_v3_resolve_vessel: {
        Args: { target_company_id: string; value: string }
        Returns: string
      }
      _replace_compliance_item_reminder_rules: {
        Args: {
          expiration_days_before: number[]
          expiration_rule_active: boolean
          one_off_dates: string[]
          reminder_audience: string
          repeat_every_days: number
          repeat_rule_active: boolean
          start_rule_active: boolean
          target_company_id: string
          target_item_id: string
        }
        Returns: undefined
      }
      _settings_can_manage_role: {
        Args: {
          actor_role: Database["public"]["Enums"]["app_role"]
          next_role: Database["public"]["Enums"]["app_role"]
          target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      _settings_email_is_app_admin: {
        Args: { target_email: string }
        Returns: boolean
      }
      accept_company_invite: { Args: { full_name?: string }; Returns: string }
      apply_compliance_workbook_import:
        | {
            Args: {
              applied_by?: string
              approved_issue_ids?: string[]
              target_import_run_id: string
            }
            Returns: string
          }
        | {
            Args: {
              applied_by?: string
              approved_issue_ids?: string[]
              resolutions?: Json
              target_import_run_id: string
            }
            Returns: string
          }
      apply_import_v3_reference_review: {
        Args: { target_import_run_id: string }
        Returns: undefined
      }
      can_edit_compliance_item_core: {
        Args: { target_item_id: string }
        Returns: boolean
      }
      can_manage_compliance_item: {
        Args: { target_item_id: string }
        Returns: boolean
      }
      claim_due_reminders: {
        Args: { claim_limit?: number; target_company_id?: string }
        Returns: {
          company_id: string
          expiration_date: string
          id: string
          instructions: string
          item_id: string
          item_name: string
          owner_current: string
          recipient_email: string
          reminder_rule_id: string
          scheduled_for: string
          start_working_on: string
          status: Database["public"]["Enums"]["compliance_item_status"]
          vessel_name: string
        }[]
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
      compliance_item_has_customer_activity: {
        Args: { target_item_id: string }
        Returns: boolean
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
      create_compliance_item:
        | {
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
        | {
            Args: {
              item_agency_id?: string
              item_agency_type?: string
              item_compliance_area?: string
              item_expiration_date?: string
              item_frequency_label?: string
              item_instructions?: string
              item_name?: string
              item_number?: string
              item_owner_codes?: string[]
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
      dry_run_compliance_workbook_import: {
        Args: {
          detected_format?: string
          imported_by?: string
          parse_summary?: Json
          parser_version?: string
          records?: Json
          target_company_id: string
          target_sheet: string
          template_version?: string
          workbook_name?: string
        }
        Returns: string
      }
      get_queue_owner_codes: {
        Args: { target_company_id: string }
        Returns: {
          code: string
          display_name: string
          is_assigned_to_current_user: boolean
          is_visible_to_current_user: boolean
          records: number
        }[]
      }
      get_workspace_task_members: {
        Args: { target_company_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      has_company_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          target_company_id: string
        }
        Returns: boolean
      }
      import_compliance_workbook_records: {
        Args: { records: Json; target_company_id: string; target_sheet: string }
        Returns: number
      }
      import_v2_is_company_wide_scope: {
        Args: { value: string }
        Returns: boolean
      }
      import_v2_normalize: { Args: { value: string }; Returns: string }
      is_app_admin: { Args: never; Returns: boolean }
      is_company_member: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      merge_agencies: {
        Args: { from_agency_id: string; to_agency_id: string }
        Returns: undefined
      }
      normalize_owner_code_list: {
        Args: { fallback_owner_code?: string; owner_codes: string[] }
        Returns: string[]
      }
      remove_agency: {
        Args: {
          expected_item_count?: number
          reassign_to_agency_id?: string
          target_agency_id: string
        }
        Returns: undefined
      }
      remove_vessel: {
        Args: {
          expected_item_count?: number
          reassign_to_vessel_id?: string
          target_vessel_id: string
        }
        Returns: undefined
      }
      reseed_vessels_from_items: {
        Args: { target_company_id?: string }
        Returns: number
      }
      save_compliance_item_reminders: {
        Args: {
          additional_recipients: Json
          external_expiration_days_before: number[]
          external_expiration_rule_active: boolean
          external_one_off_dates: string[]
          external_repeat_every_days: number
          external_repeat_rule_active: boolean
          external_start_rule_active: boolean
          item_instructions: string
          owner_expiration_days_before: number[]
          owner_expiration_rule_active: boolean
          owner_one_off_dates: string[]
          owner_repeat_every_days: number
          owner_repeat_rule_active: boolean
          owner_start_rule_active: boolean
          target_item_id: string
        }
        Returns: undefined
      }
      save_initial_vessels: {
        Args: { vessel_names: string[] }
        Returns: undefined
      }
      schedule_due_reminders: {
        Args: { target_company_id: string; target_run_date?: string }
        Returns: number
      }
      schedule_due_reminders_all_companies: {
        Args: { target_run_date?: string }
        Returns: number
      }
      schedule_due_reminders_for_company: {
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
          app_admin_contamination: boolean
          can_cancel: boolean
          can_clear_owner_codes: boolean
          can_remove: boolean
          can_update_owner_codes: boolean
          can_update_role: boolean
          created_at: string
          display_name: string
          email: string
          invited_at: string
          invited_by_display_name: string
          joined_at: string
          owner_codes: string[]
          role: Database["public"]["Enums"]["app_role"]
          status: string
          target_id: string
          target_kind: string
          target_user_id: string
        }[]
      }
      settings_remove_member_access: {
        Args: { target_company_id: string; target_membership_id: string }
        Returns: undefined
      }
      settings_update_member_access: {
        Args: {
          next_role: Database["public"]["Enums"]["app_role"]
          target_company_id: string
          target_membership_id: string
        }
        Returns: undefined
      }
      settings_update_own_profile: {
        Args: { next_full_name: string; target_company_id: string }
        Returns: undefined
      }
      settings_update_owner_code_assignment: {
        Args: {
          owner_codes: string[]
          target_company_id: string
          target_id: string
          target_kind: string
        }
        Returns: undefined
      }
      settings_update_pending_invite_access: {
        Args: {
          next_role: Database["public"]["Enums"]["app_role"]
          target_company_id: string
          target_invitation_id: string
        }
        Returns: undefined
      }
      sync_compliance_item_owner_codes: {
        Args: { selected_owner_codes?: string[]; target_item_id: string }
        Returns: string
      }
      update_compliance_item_core:
        | {
            Args: {
              next_agency_type?: string
              next_compliance_area?: string
              next_expiration_date?: string
              next_frequency_label?: string
              next_instructions?: string
              next_item_name?: string
              next_item_number?: string
              next_owner_current?: string
              next_owner_raw?: string
              next_recurrence_interval?: number
              next_recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
              next_sharepoint_url?: string
              next_start_working_on?: string
              next_status_notes?: string
              next_vessel_id?: string
              target_item_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              next_agency_id?: string
              next_agency_type?: string
              next_compliance_area?: string
              next_expiration_date?: string
              next_frequency_label?: string
              next_instructions?: string
              next_item_name?: string
              next_item_number?: string
              next_owner_codes?: string[]
              next_owner_current?: string
              next_owner_raw?: string
              next_recurrence_interval?: number
              next_recurrence_unit?: Database["public"]["Enums"]["recurrence_unit"]
              next_sharepoint_url?: string
              next_start_working_on?: string
              next_status_notes?: string
              next_vessel_id?: string
              target_item_id: string
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
  graphql_public: {
    Enums: {},
  },
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

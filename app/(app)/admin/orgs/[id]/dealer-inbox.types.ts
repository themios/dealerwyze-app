export type ThreadType     = 'success' | 'support' | 'billing' | 'sales'
export type ThreadStatus   = 'open' | 'resolved' | 'archived'
export type MessageChannel = 'email' | 'note' | 'call_log' | 'in_app'

export interface DealerThread {
  id: string
  subject: string
  thread_type: ThreadType
  status: ThreadStatus
  assigned_to: string | null
  assigned_name: string | null
  created_by: string | null
  message_count: number
  last_message_at: string | null
  unread_count: number
  created_at: string
  updated_at: string
}

export interface DealerMessage {
  id: string
  thread_id: string
  sender_type: 'platform' | 'dealer' | 'system'
  sender_display_name: string | null
  channel: MessageChannel
  body: string
  sent_at: string
  read_at: string | null
}

export interface DealerTask {
  id: string
  thread_id: string | null
  thread_subject: string | null
  assigned_to: string | null
  assigned_name: string | null
  title: string
  notes: string | null
  due_at: string | null
  completed_at: string | null
  created_at: string
}

export type LegacyItem =
  | { kind: 'email'; id: string; subject: string; body_text: string | null; email_type: string; type_label: string; to_email: string; ts: string }
  | { kind: 'note';  id: string; note: string; contact_method: string | null; admin_name: string; admin_user_id: string; ts: string }

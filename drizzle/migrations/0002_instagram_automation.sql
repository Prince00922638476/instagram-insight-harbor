-- Instagram automation is opt-in and limited to comments containing an owner-configured keyword.
-- These tables are accessed only through the server-side Supabase service-role client.
CREATE TABLE IF NOT EXISTS public.instagram_automation_settings (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft', 'auto')),
  trigger_keyword text NOT NULL DEFAULT 'INFO',
  reply_instruction text NOT NULL DEFAULT 'Write a short, helpful, friendly reply in the same language as the comment. Do not make promises, invent prices, or request personal information.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instagram_automation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_automation_settings FROM anon, authenticated;
GRANT ALL ON public.instagram_automation_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.instagram_reply_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  comment_id text NOT NULL,
  media_id text NOT NULL DEFAULT '',
  commenter_username text NOT NULL DEFAULT '',
  comment_text text NOT NULL DEFAULT '',
  suggested_reply text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'needs_review', 'sent', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (user_id, comment_id)
);
ALTER TABLE public.instagram_reply_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_reply_drafts FROM anon, authenticated;
GRANT ALL ON public.instagram_reply_drafts TO service_role;
CREATE INDEX IF NOT EXISTS instagram_reply_drafts_user_status_idx
  ON public.instagram_reply_drafts (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  event_key text PRIMARY KEY,
  user_id uuid,
  event_type text NOT NULL DEFAULT 'comment',
  status text NOT NULL DEFAULT 'received',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_webhook_events FROM anon, authenticated;
GRANT ALL ON public.instagram_webhook_events TO service_role;
CREATE INDEX IF NOT EXISTS instagram_webhook_events_created_idx
  ON public.instagram_webhook_events (created_at DESC);

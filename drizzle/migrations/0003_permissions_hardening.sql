-- Keep confidential application state inaccessible to browser roles, even if
-- permissive default grants were configured in the Supabase project.
REVOKE ALL ON TABLE public.instagram_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.instagram_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mcp_api_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.instagram_automation_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.instagram_reply_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.instagram_webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.activity_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;

-- Only the connection summary is directly readable by an authenticated user;
-- row-level security still limits it to that user's own row.
GRANT SELECT ON TABLE public.instagram_connections TO authenticated;
GRANT ALL ON TABLE public.instagram_connections TO service_role;
GRANT ALL ON TABLE public.instagram_tokens TO service_role;
GRANT ALL ON TABLE public.oauth_states TO service_role;
GRANT ALL ON TABLE public.mcp_api_keys TO service_role;
GRANT ALL ON TABLE public.instagram_automation_settings TO service_role;
GRANT ALL ON TABLE public.instagram_reply_drafts TO service_role;
GRANT ALL ON TABLE public.instagram_webhook_events TO service_role;

-- Preserve the original least-privilege browser access for user-visible records.
GRANT SELECT, INSERT ON TABLE public.activity_log TO authenticated;
GRANT ALL ON TABLE public.activity_log TO service_role;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

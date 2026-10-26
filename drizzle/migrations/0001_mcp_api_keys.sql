CREATE TABLE public.mcp_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'AI assistant',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX mcp_api_keys_user_idx ON public.mcp_api_keys (user_id, created_at DESC);
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.mcp_api_keys TO service_role;

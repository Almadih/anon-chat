-- Add tables to the supabase_realtime publication
-- Note: This requires the user running the migration (postgres) to have appropriate permissions.
-- It might be necessary to temporarily grant SUPERUSER or specific publication modification rights if errors occur.

begin;

  -- Add chats table to the publication
  alter publication supabase_realtime add table public.chats;

  -- Add messages table to the publication
  alter publication supabase_realtime add table public.messages;

commit;

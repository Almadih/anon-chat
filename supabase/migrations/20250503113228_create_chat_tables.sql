-- Create queue table
create table public.queue (
  user_id uuid references public.profiles(id) on delete cascade not null primary key,
  mbti_type text not null,
  interested_mbti_types text[] not null,
  status text not null default 'waiting', -- 'waiting', 'matched'
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for queue
alter table public.queue enable row level security;

-- Policy: Allow authenticated users to insert their own entry into the queue
drop policy if exists "Allow individual insert access" on public.queue; -- Drop old one first
create policy "Allow individual insert access" on public.queue
  for insert to authenticated -- Specify the role
  with check (auth.uid() = user_id); -- Check remains the same, but role context is clearer

-- Policy: Allow users to select their own queue entry (e.g., to check status)
create policy "Allow individual select access" on public.queue
  for select using (auth.uid() = user_id);

-- Policy: Allow users to update their own queue status (e.g., to 'matched' - maybe better handled by function)
-- Or maybe just delete? Let's allow delete for now.
-- create policy "Allow individual update access" on public.queue
--   for update using (auth.uid() = user_id);

-- Policy: Allow users to delete their own queue entry (leave queue)
create policy "Allow individual delete access" on public.queue
  for delete using (auth.uid() = user_id);

-- Note: Selecting other users for matching might require a SECURITY DEFINER function
-- or relaxing select permissions carefully. We'll use a function later.


-- Create chats table
create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid references public.profiles(id) on delete set null,
  user2_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ended_at timestamp with time zone default null
);

-- Enable RLS for chats
alter table public.chats enable row level security;

-- Policy: Allow users involved in the chat to select the chat record
create policy "Allow participants select access" on public.chats
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

-- Policy: Allow users involved to update ended_at (to end the chat)
create policy "Allow participants update access for ending chat" on public.chats
  for update using (auth.uid() = user1_id or auth.uid() = user2_id)
  with check (auth.uid() = user1_id or auth.uid() = user2_id); -- Restrict columns? Maybe just ended_at?

-- Note: Chat creation should ideally be handled by a secure function.


-- Create messages table
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null check (char_length(content) > 0), -- Basic validation
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for messages
alter table public.messages enable row level security;

-- Create an index for faster message fetching per chat
create index messages_chat_id_idx on public.messages (chat_id);

-- Policy: Allow users involved in the chat to select messages
create policy "Allow chat participants select access" on public.messages
  for select using (
    exists (
      select 1
      from public.chats
      where chats.id = messages.chat_id
      and (chats.user1_id = auth.uid() or chats.user2_id = auth.uid())
    )
  );

-- Policy: Allow users to insert messages into chats they are part of
create policy "Allow participants insert access" on public.messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1
      from public.chats
      where chats.id = messages.chat_id
      and (chats.user1_id = auth.uid() or chats.user2_id = auth.uid())
      and chats.ended_at is null -- Can only send messages in active chats
    )
  );

-- Grant permissions to authenticated role for the new tables
grant select, insert, update, delete on table public.queue to authenticated;
grant select, insert, update, delete on table public.chats to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

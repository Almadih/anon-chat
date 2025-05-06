-- Create profiles table
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  mbti_type text,
  interested_mbti_types text[], -- Array of text for multiple types
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Allow Supabase admin to bypass RLS (important for triggers)
-- Note: It's generally recommended to keep RLS enabled and grant specific bypass privileges if needed,
-- but bypassing for the table owner (supabase_admin) is often necessary for trigger functions defined with SECURITY DEFINER.
-- Re-evaluate if more granular control is needed later.
-- alter table public.profiles enable row level security; -- Enable RLS first
-- alter role supabase_admin bypass row level security; -- Example, adjust role if needed

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer; -- Use security definer to ensure it runs with creator privileges

-- Trigger to update updated_at on row update
create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Function to copy email from auth.users on new user creation
-- Also sets default empty array for interested types
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, interested_mbti_types)
  values (new.id, new.email, '{}'); -- Initialize interested_mbti_types as empty array
  return new;
end;
$$ language plpgsql security definer; -- Use security definer

-- Trigger to create a profile entry when a new user signs up
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Row Level Security on the table
alter table public.profiles enable row level security;

-- Policy: Allow users to read their own profile
create policy "Allow individual read access" on public.profiles
  for select using (auth.uid() = id);

-- Policy: Allow users to update their own profile
create policy "Allow individual update access" on public.profiles
  for update using (auth.uid() = id);

-- Grant usage on the public schema to the authenticated role
-- (Often needed for RLS policies involving auth.uid() to work correctly)
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

-- Grant execute on functions to the authenticated role if they need to call them directly (unlikely here)
-- grant execute on function public.handle_updated_at() to authenticated;
-- grant execute on function public.handle_new_user() to authenticated;

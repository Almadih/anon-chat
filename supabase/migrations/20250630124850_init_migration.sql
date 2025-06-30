create table "public"."chats" (
    "id" uuid not null default gen_random_uuid(),
    "user1_id" uuid,
    "user2_id" uuid,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "ended_at" timestamp with time zone
);


alter table "public"."chats" enable row level security;

create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "chat_id" uuid not null,
    "sender_id" uuid not null,
    "content" text not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."messages" enable row level security;

create table "public"."profiles" (
    "id" uuid not null,
    "email" text,
    "mbti_type" text,
    "interested_mbti_types" text[],
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "public_key" jsonb
);


alter table "public"."profiles" enable row level security;

create table "public"."queue" (
    "user_id" uuid not null,
    "mbti_type" text not null,
    "interested_mbti_types" text[] not null,
    "status" text not null default 'waiting'::text,
    "joined_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."queue" enable row level security;

CREATE UNIQUE INDEX chats_pkey ON public.chats USING btree (id);

CREATE INDEX messages_chat_id_idx ON public.messages USING btree (chat_id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX queue_pkey ON public.queue USING btree (user_id);

alter table "public"."chats" add constraint "chats_pkey" PRIMARY KEY using index "chats_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."queue" add constraint "queue_pkey" PRIMARY KEY using index "queue_pkey";

alter table "public"."chats" add constraint "chats_user1_id_fkey" FOREIGN KEY (user1_id) REFERENCES profiles(id) ON DELETE SET NULL not valid;

alter table "public"."chats" validate constraint "chats_user1_id_fkey";

alter table "public"."chats" add constraint "chats_user2_id_fkey" FOREIGN KEY (user2_id) REFERENCES profiles(id) ON DELETE SET NULL not valid;

alter table "public"."chats" validate constraint "chats_user2_id_fkey";

alter table "public"."messages" add constraint "messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_chat_id_fkey";

alter table "public"."messages" add constraint "messages_content_check" CHECK ((char_length(content) > 0)) not valid;

alter table "public"."messages" validate constraint "messages_content_check";

alter table "public"."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_sender_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."queue" add constraint "queue_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."queue" validate constraint "queue_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, interested_mbti_types)
  values (new.id, new.email, '{}'); -- Initialize interested_mbti_types as empty array
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$function$
;

grant delete on table "public"."chats" to "anon";

grant insert on table "public"."chats" to "anon";

grant references on table "public"."chats" to "anon";

grant select on table "public"."chats" to "anon";

grant trigger on table "public"."chats" to "anon";

grant truncate on table "public"."chats" to "anon";

grant update on table "public"."chats" to "anon";

grant delete on table "public"."chats" to "authenticated";

grant insert on table "public"."chats" to "authenticated";

grant references on table "public"."chats" to "authenticated";

grant select on table "public"."chats" to "authenticated";

grant trigger on table "public"."chats" to "authenticated";

grant truncate on table "public"."chats" to "authenticated";

grant update on table "public"."chats" to "authenticated";

grant delete on table "public"."chats" to "service_role";

grant insert on table "public"."chats" to "service_role";

grant references on table "public"."chats" to "service_role";

grant select on table "public"."chats" to "service_role";

grant trigger on table "public"."chats" to "service_role";

grant truncate on table "public"."chats" to "service_role";

grant update on table "public"."chats" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."queue" to "anon";

grant insert on table "public"."queue" to "anon";

grant references on table "public"."queue" to "anon";

grant select on table "public"."queue" to "anon";

grant trigger on table "public"."queue" to "anon";

grant truncate on table "public"."queue" to "anon";

grant update on table "public"."queue" to "anon";

grant delete on table "public"."queue" to "authenticated";

grant insert on table "public"."queue" to "authenticated";

grant references on table "public"."queue" to "authenticated";

grant select on table "public"."queue" to "authenticated";

grant trigger on table "public"."queue" to "authenticated";

grant truncate on table "public"."queue" to "authenticated";

grant update on table "public"."queue" to "authenticated";

grant delete on table "public"."queue" to "service_role";

grant insert on table "public"."queue" to "service_role";

grant references on table "public"."queue" to "service_role";

grant select on table "public"."queue" to "service_role";

grant trigger on table "public"."queue" to "service_role";

grant truncate on table "public"."queue" to "service_role";

grant update on table "public"."queue" to "service_role";

create policy "Allow participants select access"
on "public"."chats"
as permissive
for select
to public
using (((auth.uid() = user1_id) OR (auth.uid() = user2_id)));


create policy "Allow participants update access for ending chat"
on "public"."chats"
as permissive
for update
to public
using (((auth.uid() = user1_id) OR (auth.uid() = user2_id)))
with check (((auth.uid() = user1_id) OR (auth.uid() = user2_id)));


create policy "Allow chat participants select access"
on "public"."messages"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM chats
  WHERE ((chats.id = messages.chat_id) AND ((chats.user1_id = auth.uid()) OR (chats.user2_id = auth.uid()))))));


create policy "Allow participants insert access"
on "public"."messages"
as permissive
for insert
to public
with check (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM chats
  WHERE ((chats.id = messages.chat_id) AND ((chats.user1_id = auth.uid()) OR (chats.user2_id = auth.uid())) AND (chats.ended_at IS NULL))))));


create policy "Allow individual read access"
on "public"."profiles"
as permissive
for select
to public
using (true);


create policy "Allow individual update access"
on "public"."profiles"
as permissive
for update
to public
using ((auth.uid() = id));


create policy "Allow individual delete access"
on "public"."queue"
as permissive
for delete
to public
using ((auth.uid() = user_id));


create policy "Allow individual insert access"
on "public"."queue"
as permissive
for insert
to authenticated
with check ((auth.uid() = user_id));


create policy "Allow individual select access"
on "public"."queue"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "Enable update for users based on id"
on "public"."queue"
as permissive
for update
to public
using ((auth.uid() = user_id));


CREATE TRIGGER on_profile_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();



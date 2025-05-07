ALTER TABLE public.profiles
ADD COLUMN public_key JSONB;

COMMENT ON COLUMN public.profiles.public_key IS 'Stores the user''s public key in JWK format for E2E encryption.';

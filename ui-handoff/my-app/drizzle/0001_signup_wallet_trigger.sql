-- PostgreSQL Trigger to automatically provision user wallet with 5 welcome credits on signup
-- Schema: public.wallets, public.credit_transactions
-- Trigger Table: neon_auth.users

CREATE OR REPLACE FUNCTION public.handle_new_user_signup_wallet()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Insert new wallet for user with 5 credits on signup
  INSERT INTO public.wallets (id, user_id, balance, updated_at)
  VALUES (gen_random_uuid(), NEW.id, 5, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. Insert immutable audit ledger entry for signup bonus
  INSERT INTO public.credit_transactions (id, user_id, amount, transaction_type, status, reference_id, metadata, created_at)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    5,
    'signup_bonus',
    'completed',
    'signup_bonus_' || NEW.id,
    '{"event": "user.signup", "credits": 5, "description": "Welcome bonus credits on account creation"}',
    NOW()
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on neon_auth.users (fires only when a new user is inserted into neon_auth schema)
DROP TRIGGER IF EXISTS on_user_signup_create_wallet ON neon_auth.users;
CREATE TRIGGER on_user_signup_create_wallet
  AFTER INSERT ON neon_auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup_wallet();

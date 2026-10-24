# oaz-checkout-live

Production Supabase Edge Function source archive for the MOVP live checkout.

Current production baseline when this directory was introduced: v15.

Safety rules:
- Never commit Supabase or Stripe secrets.
- Public sales must remain controlled by the database launch gates.
- Controlled LIVE testing must not require exposing the owner launch token in browser code.
- Consent binding and billing validation are mandatory.
- Stripe Tax remains disabled for the current launch configuration.

Files in this directory mirror the deployed function and its relative dependencies so changes can be reviewed before deployment.

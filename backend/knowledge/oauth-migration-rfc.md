# RFC-042: PartnerHub OAuth / OIDC Migration

Status: Draft · Author: Dev · Last updated: June 26

## Summary

Move PartnerHub from homegrown session auth to OAuth 2.0 with OpenID Connect so partners can bring their own identity providers (Okta, Entra ID, Google Workspace).

## Proposal

Authorization Code + PKCE for the portal UI; Client Credentials for machine-to-machine API access. Access tokens are short-lived JWTs (5 min) validated locally at the gateway; a Redis-backed revocation list covers compromised-key scenarios. Refresh tokens are hashed and stored in a dedicated PostgreSQL schema with access restricted to the auth service role. Signing keys rotate quarterly.

## Migration plan

Dual-write legacy audit events and new OAuth events to Kafka during a six-week transition so downstream consumers (audit pipeline, analytics) migrate on their own schedule. Rollout is cohort-based behind a per-partner feature flag with percentage ramp; pilot partners first.

## Open questions

- Revocation SLA: how fast must a compromised partner key die? (Target: seconds.)
- SCIM provisioning for enterprise tenants — in scope for v1?

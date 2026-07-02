# PartnerHub — Architecture Overview

PartnerHub is the self-service portal integration partners use to manage API keys, webhook configurations, and usage dashboards.

## Components

Partner traffic enters through the API Gateway, which terminates TLS, authenticates requests, and applies per-key rate limits. The gateway routes to the PartnerHub backend (Python/FastAPI), which owns partner accounts, API keys, and webhook configs in PostgreSQL. Session state lives in Redis. All partner-facing events (key created, webhook updated, login) are published to Kafka topic `partner-events`, partitioned by tenant id; the audit pipeline and analytics both consume it.

## Authentication

As of the June design review, PartnerHub uses the homegrown session auth service. OAuth/OIDC support is planned; three enterprise prospects (including Northwind) require SSO before signing.

## Known constraints

- The staging Kubernetes cluster runs the legacy ingress controller; gateway-level rate limiting cannot be tested there until the upgrade lands.
- Webhook configs have no optimistic-locking; concurrent edits last-write-win (reported by Northwind as a concern).

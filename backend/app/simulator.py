"""A scripted, realistic engineering meeting used for demo mode.

Streams one utterance every few seconds so the entire live pipeline —
transcription, analysis, tutor, questions, actions, decisions, graph —
can be experienced without any external service.
"""

DEMO_TITLE = "PartnerHub — Auth migration & scale planning"

SPEAKER_ROLES = {
    "Maya": "Engineering Manager",
    "Dev": "Staff Engineer",
    "Priya": "Product Manager",
    "Tom": "Platform / DevOps",
}

# (speaker, utterance, seconds_after_previous)
DEMO_SCRIPT: list[tuple[str, str, float]] = [
    ("Maya", "Alright, everyone's here. Today we need to close on the PartnerHub authentication migration and talk through the scale concerns before the Q3 launch.", 0),
    ("Priya", "Quick context for anyone new: PartnerHub is the portal our integration partners use to manage API keys and webhooks. Three enterprise customers are waiting on SSO before they sign.", 3),
    ("Dev", "Right. The core proposal is to move PartnerHub off our homegrown session auth and onto OAuth with OpenID Connect, so partners can bring their own identity providers.", 3),
    ("Tom", "Before we commit — the current session service also feeds the audit pipeline. If we swap auth, the audit events change shape, and compliance reads those.", 3),
    ("Dev", "Good catch. My plan is to keep emitting the legacy audit events during the transition, and dual-write the new OAuth events to Kafka so downstream consumers can migrate on their own schedule.", 3),
    ("Priya", "How long does the dual-write period last? I don't want this dragging into next quarter.", 3),
    ("Dev", "Six weeks max. I'll write up the migration plan and the event schema changes by Friday.", 3),
    ("Maya", "Okay. Tom, what's the infra picture if partner traffic triples at launch like sales is projecting?", 3),
    ("Tom", "Honestly, I'm worried about scalability of the token introspection path. Every API call from a partner hits the auth service to validate the token. At 3x traffic that's our first bottleneck.", 3),
    ("Dev", "Two options: cache introspection results in Redis with a short TTL, or switch to self-contained JWT access tokens so services validate signatures locally without calling anything.", 3),
    ("Tom", "JWTs make revocation harder though. If a partner key is compromised we need it dead in seconds, not when the token expires.", 3),
    ("Dev", "Fair. Hybrid then — short-lived JWTs, five minute expiry, plus a Redis-backed revocation list that the gateway checks. Best of both.", 3),
    ("Maya", "I like it. Let's go with the hybrid JWT plus Redis revocation approach because it keeps validation local but preserves fast revocation.", 3),
    ("Priya", "One thing from the customer call yesterday: Northwind asked whether two partners editing the same webhook config can overwrite each other. Apparently that bit them with another vendor.", 3),
    ("Dev", "That's an optimistic concurrency question. We should add a version column to the webhook configs — if two people save at once, the second save gets a conflict and has to refresh. I can add that to the same migration.", 3),
    ("Maya", "Do it. Priya, can you confirm with Northwind that a conflict-and-retry experience is acceptable for their workflow?", 3),
    ("Priya", "Will do, I'll get their answer by Wednesday.", 3),
    ("Tom", "Heads up on a blocker: the staging Kubernetes cluster is still on the old ingress controller, so I can't test the new gateway rate limiting there. The upgrade ticket has been sitting with the platform team for two weeks.", 3),
    ("Maya", "That's now a launch risk. I'll escalate the ingress upgrade to platform leadership today.", 3),
    ("Tom", "Once that's unblocked I'll set up rate limiting per partner API key at the gateway, token bucket, so one noisy partner can't starve the others.", 3),
    ("Priya", "Do we have a way to see all this partner traffic? When Northwind complains about latency I currently have nothing to show them.", 3),
    ("Tom", "That's the OpenTelemetry rollout. Traces are already flowing from the gateway; I need to instrument the auth service and PartnerHub backend next, then we get per-partner latency dashboards.", 3),
    ("Maya", "Let's make the observability work part of the launch criteria, not a fast-follow. Agreed?", 3),
    ("Dev", "Agreed. I'll pair with Tom next week to instrument the auth service.", 3),
    ("Priya", "For rollout — can we put the new auth behind a feature flag and migrate partners in cohorts? Pilot with two friendly partners, then ramp.", 3),
    ("Dev", "Yes, we'll adopt a feature flag per partner with percentage ramp. If error rates spike we flip the flag back and they land on legacy auth instantly.", 3),
    ("Maya", "Good. Decision recorded: cohort rollout behind feature flags, pilot partners first. Priya picks the pilot partners.", 3),
    ("Priya", "I'll have the pilot list by end of week. And I'll draft the partner comms about the SSO timeline.", 3),
    ("Tom", "Last thing — where do refresh tokens live? If we're serious about SOC 2 we can't keep them in the same Postgres as everything else with broad access.", 3),
    ("Dev", "Proposal: refresh tokens hashed in a separate Postgres schema, access restricted to the auth service role only, and we rotate the signing keys quarterly.", 3),
    ("Maya", "Take that to the security review. Let's book it for Thursday. Anything else? ... Great meeting everyone — Dev sends the migration plan Friday, Priya confirms Northwind and pilots, Tom owns ingress escalation follow-through and rate limiting.", 3),
]

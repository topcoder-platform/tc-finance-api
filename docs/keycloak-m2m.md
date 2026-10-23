# Keycloak M2M migration branch

This code is isolated on `keycloak_m2M`. Do not deploy this branch until the
workload and its callers are ready. Existing DEV services continue using Auth0.
The core dependency is pinned to a reviewed Keycloak prerelease commit, including
transitive wrapper uses through the pnpm override. No npm latest dependency is used.
`pnpm-lock.yaml` resolves a single 4.0.0-keycloak.2 (core commit `112d54a`), including
the copy under `@topcoder/billing-accounts-api-v6`.

## Provider switch: `USE_KEYCLOAK`

`USE_KEYCLOAK=true` makes `TopcoderM2MService.getToken` (used by `m2mFetch`, the Bus
client and the Members client) get its token from Keycloak, using `KEYCLOAK_TOKEN_URL`,
`KEYCLOAK_AUDIENCE`, `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET` (optional
`KEYCLOAK_SCOPE` narrows the client's defaults); `KEYCLOAK_ISSUER` is also required.
Startup validation (`ConfigEnv`) then requires those five `KEYCLOAK_*` settings.

Unset or `false` restores the Auth0 behaviour from before the migration, using the same
request code: `POST ${AUTH0_TC_PROXY_URL}/token` with `auth0_url`
`${AUTH0_M2M_TOKEN_URL}/oauth/token`, `AUTH0_M2M_CLIENT_ID`, `AUTH0_M2M_SECRET`,
`AUTH0_M2M_AUDIENCE` and `AUTH0_M2M_GRANT_TYPE`. Startup validation then requires those six
`AUTH0_*` settings, as before. Tokens are not cached by the service in this mode, and a
failed request is logged and yields no token, as before.

`tc-core-library-js` decides (`auth.useKeycloak`), so the service and the core always
agree. Any value other than `true`/`false` fails startup. The CircleCI deploy loads only
`/config/finance-api-v6/appvar` (not `/config/common/global-appvar`), so the flag is
`/config/finance-api-v6/appvar/USE_KEYCLOAK`, next to the Auth0 and Keycloak settings.

Incoming machine tokens: with `true`, Keycloak tokens are accepted, plus Auth0 tokens
while `LEGACY_M2M_ISSUERS`/`LEGACY_M2M_AUDIENCE` are set. With `false`, Auth0 tokens
are accepted through `LEGACY_M2M_*`, plus Keycloak tokens while `KEYCLOAK_ISSUER` and
`KEYCLOAK_AUDIENCE` are set, so callers that have not switched yet keep working.

**Rollback:** set `USE_KEYCLOAK=false` and force a new deployment so tasks re-read SSM.
No code or dependency change is needed. Keep the `AUTH0_M2M_*`/`AUTH0_TC_PROXY_URL`
settings in SSM until Keycloak has been accepted.

The DEV issuer is `https://keycloak.topcoder-dev.com/realms/topcoder-m2m-dev`,
audience `https://api.topcoder-dev.com`, and managed endpoint
`https://keycloak.topcoder-dev.com/m2m/token`.

Member sessions remain Auth0. Keep `VALID_ISSUERS` and `AUTH_SECRET` where legacy
member HMAC tokens are supported. Set `AUTH_USER_AUDIENCES` to a JSON array, or
explicitly retain existing user-token audience behavior with
`ALLOW_LEGACY_USER_AUDIENCE=true`. Never apply that exception to M2M tokens.
`LEGACY_M2M_ISSUERS` and `LEGACY_M2M_AUDIENCE` let Auth0 machine tokens pass the same
normalizer (see the provider switch above).

`tc-core-library-js` owns signature, issuer, audience, lifetime, and machine/user
classification. Service adapters must use its verified `kind`, `isMachine`, and
`scopes` rather than decode/reclassify claims. Scope guards delegate exact matching
to the library with explicit all/any policy. Existing business roles and documented
scope aliases remain endpoint policy; adding OAuth scopes to a user token never
grants machine access. No permissive fallback or synthetic token path is available.

Before rollout run this project's `nvm use`, `pnpm lint`, `pnpm build`, and targeted
authentication tests. Validate real authorized/unauthorized routes with both a
Keycloak service token and a member token, including wrong audiences and insufficient
scopes. Switch only after every downstream receiver accepts the issuer. A failed
Keycloak request is never retried against Auth0; rolling back is the explicit
`USE_KEYCLOAK=false` change above.

Adapter policy checks cover verified machine identity, scope separation from members,
and sanitized validation failures. Groups retains its explicit singular/plural and
`all:groups` aliases; Bus requires all declared scopes, while Finance, Groups, and
Engagements retain their explicit any-of route policies. Permission names are case
sensitive. Engagements privileged member roles retain their existing access policy.

Validation on 23 October 2026: project lint and build pass; the full unit test
suite passes, including the shared validator/guard adapter checks and the provider
switch checks in `topcoder-m2m.service.spec.ts` and `config.env.spec.ts`.

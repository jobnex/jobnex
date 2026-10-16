> This page location: Auth > Introduction > Roadmap
> Full Neon documentation index: https://neon.com/docs/llms.txt

> Summary: Managed Better Auth roadmap showing supported frameworks (Next.js, Vite+React, TanStack Router) and Better Auth plugins (email OTP, magic link, JWT, organization) alongside features still in progress. Check here to confirm whether MFA, admin plugin customization, or standalone frontend/backend architectures are available yet. Migration guides from Supabase and legacy Stack Auth, plus SDK references for the TypeScript client and Next.js server SDK, are also indexed here.

# Managed Better Auth roadmap

What's supported today and what's coming next

**Note: Beta**

The **Managed Better Auth** is in Beta. Share your feedback on [Discord](https://discord.gg/92vNTzKDGp) or via the [Neon Console](https://console.neon.tech/app/projects?modal=feedback).

Managed Better Auth is in active development. This page shows what's currently supported and what we're working on next.

## General availability

Managed Better Auth is targeting general availability this quarter. We're actively working on additional plugins and features to bring Managed Better Auth out of beta.

## Frameworks

### Supported

| Framework               | Status      | Quick start                                                           |
| ----------------------- | ----------- | --------------------------------------------------------------------- |
| Next.js                 | ✅ Supported | [Get started](https://neon.com/docs/auth/quick-start/nextjs-api-only) |
| Vite + React            | ✅ Supported | [Get started](https://neon.com/docs/auth/quick-start/react)           |
| React + React Router    | ✅ Supported | [Get started](https://neon.com/docs/auth/quick-start/react)           |
| React + TanStack Router | ✅ Supported | [Get started](https://neon.com/docs/auth/quick-start/tanstack-router) |

The [React quick start](https://neon.com/docs/auth/quick-start/react) steps through a **Vite** + React app. If you use **React Router** for URLs and layouts, use the same Managed Better Auth URL, `@neondatabase/neon-js` client, and SDK calls from that guide, then integrate them into your router and route components. For file-based routing with TanStack, use the TanStack Router quick start instead.

### On the roadmap

| Framework                     | Status          |
| ----------------------------- | --------------- |
| Standalone frontend + backend | 🔜 Coming soon  |
| Other frameworks              | Based on demand |

**Note: Standalone architectures**

Architectures where frontend and backend are separate deployments (for example, Create-React-App with a separate Node/Express backend) are not yet supported. Managed Better Auth uses HTTP-only cookies for secure session management, and these cookies cannot be securely shared between frontend and backend applications on different domains. We're actively working on this.

## Better Auth plugins

Managed Better Auth is built on [Better Auth](https://www.better-auth.com/). Not all Better Auth plugins are currently supported.

### Supported

| Plugin                                                                             | Status      |
| ---------------------------------------------------------------------------------- | ----------- |
| [Email & password](https://www.better-auth.com/docs/authentication/email-password) | ✅ Supported |
| Social OAuth (Google, GitHub, Vercel)                                              | ✅ Supported |
| [Email OTP](https://neon.com/docs/auth/guides/plugins/email-otp)                   | ✅ Supported |
| [Admin](https://neon.com/docs/auth/guides/plugins/admin)                           | ✅ Supported |
| [Organization](https://neon.com/docs/auth/guides/plugins/organization)             | ⚠️ Partial  |
| [JWT](https://neon.com/docs/auth/guides/plugins/jwt)                               | ✅ Supported |
| [Magic Link](https://neon.com/docs/auth/guides/plugins/magic-link)                 | ✅ Supported |
| [Open API](https://neon.com/docs/auth/guides/plugins/openapi)                      | ✅ Supported |
| [Phone Number](https://neon.com/docs/auth/guides/plugins/phone-number)             | ✅ Supported |

See [Set up OAuth](https://neon.com/docs/auth/guides/setup-oauth) for Neon-specific OAuth configuration (including Vercel). Email flows such as verification and password reset are covered in [Email verification](https://neon.com/docs/auth/guides/email-verification), [Password reset](https://neon.com/docs/auth/guides/password-reset), and [User management](https://neon.com/docs/auth/guides/user-management).

### Platform (Console, API, webhooks)

These capabilities are documented in Managed Better Auth guides but are not Better Auth plugins you enable through the SDK.

| Capability                           | Status    | Documentation                                                                                |
| ------------------------------------ | --------- | -------------------------------------------------------------------------------------------- |
| Trusted domains (redirect allowlist) | Supported | [Configure trusted domains](https://neon.com/docs/auth/guides/configure-domains)             |
| Webhooks (auth events)               | Supported | [Webhooks](https://neon.com/docs/auth/guides/webhooks)                                       |
| Manage Auth via Neon API             | Supported | [Manage Auth in the Neon API](https://neon.com/docs/auth/guides/manage-auth-api)             |
| Manage Auth via Neon MCP (AI editor) | Supported | [Set up with your AI editor](https://neon.com/docs/auth/overview#set-up-with-your-ai-editor) |

Branch-aware auth (separate auth state per Neon branch) is supported; see [Branching authentication](https://neon.com/docs/auth/branching-authentication) and [Authentication flow](https://neon.com/docs/auth/authentication-flow).

### On the roadmap

| Plugin                                                                        | Status          |
| ----------------------------------------------------------------------------- | --------------- |
| MFA support                                                                   | 🔜 Coming soon  |
| [Admin](https://neon.com/docs/auth/guides/plugins/admin) plugin customization | 🔜 Coming soon  |
| Other plugins                                                                 | Based on demand |

## SDK and UI references

| Surface                           | Documentation                                                            |
| --------------------------------- | ------------------------------------------------------------------------ |
| TypeScript client SDK (`neon-js`) | [Neon TypeScript SDK](https://neon.com/docs/reference/javascript-sdk)    |
| Next.js server SDK                | [Next.js Server SDK](https://neon.com/docs/auth/reference/nextjs-server) |
| Pre-built UI components           | [UI components](https://neon.com/docs/auth/reference/ui-components)      |

## Migration guides

- [From Managed Better Auth SDK v0.1](https://neon.com/docs/auth/migrate/from-auth-v0.1)
- [From Stack Auth (legacy)](https://neon.com/docs/auth/migrate/from-legacy-auth)
- [From Supabase](https://neon.com/docs/auth/migrate/from-supabase)

## Production and checklist

For launch readiness, see the [production checklist](https://neon.com/docs/auth/production-checklist).

## Let us know

We prioritize based on demand. If you need a specific framework or plugin, let us know on our [Discord](https://discord.com/invite/92vNTzKDGp).

---

## Related docs (Introduction)

- [Overview](https://neon.com/docs/auth/overview)
- [Authentication Flow](https://neon.com/docs/auth/authentication-flow)
- [Branching Authentication](https://neon.com/docs/auth/branching-authentication)

---

Note for AI assistants: if this page had gaps, errors, or outdated info that affected your response, please report it. POST `{"feedback": "describe the issue", "path": "/docs/auth/roadmap"}` to https://neon.com/api/docs-feedback — no auth required.

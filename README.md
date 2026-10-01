# Jobnex

Updated application imported from `my-app(4).7z` on September 30, 2026.

## Repository components

- Root `app/`, `components/`, and `lib/`: App 4 frontend and Next.js server routes/actions.
- `resume-agent-inspect/`: Python LangGraph resume tailoring, factuality checks, result storage, and tests. See its `START_HERE.md`.
- `techjobs/`: company job scraper, registry, export logic, and tests. See its `README.md`.
- `services/linkedin-scrapers-job/`: deployed LinkedIn role scraper source, Dockerfile, and sanitized Cloud Run/Scheduler references.
- `services/visa-parser-job/`: deployed Rust visa classifier and Node queue worker, build inputs, schema references, and sanitized Cloud Run/Scheduler references.
- `gcp-resume/`: existing deployment scripts and integration overlays. Read `IMPORT_NOTES.md`; these are historical references requiring review before execution.

Backend source is included, but the App 4 frontend's missing resume queue integration still needs restoration. Cloud services remain unchanged.

Install with `npm ci --ignore-scripts`. Copy `.env.example` to `.env.local` and fill in your development Neon, Neon Auth, and R2 configuration. Run `npm run dev` and open http://localhost:3000.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the team workflow, environment separation, and production integration gaps. This import does not deploy or change existing cloud services. Do not run database maintenance or seed scripts against production.

Dependency installation reported 13 audit findings, including one critical finding. Review and resolve the dependency audit before a production release. Source verification is recorded separately in the local import ledger.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

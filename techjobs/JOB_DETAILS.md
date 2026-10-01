# Job details and Neon mapping

Reference: Neon project `trail_dev` (`broad-base-06154424`), database `neondb`, production branch `br-plain-morning-ayf71kf3`, `public.jobs`. Schema and country lookup snapshots are saved in `neon_jobs_schema.json` and `neon_countries.json`. Neon was read only; no rows or schema were changed.

## Collect

```powershell
python techjobs.py --sector life-sciences --all --bio-roles --details --json jobs_full_details.jsonl --csv jobs_full_details.csv --db-json jobs_db_drafts.jsonl
```

Use `--any-country` for worldwide roles. Omit `--bio-roles` to include all roles at these employers. `--max-per-company` limits paginated boards; whole-board APIs may return more. Exports append: use fresh filenames for a new snapshot. `--db-json` implies `--details`.

Description HTML and plain text, disclosed salary bounds/currency/period and salary evidence, job/application URLs, employment type, workplace type, expiry, collection time, status/errors, and raw employer JSON are retained in the full detail JSONL. Raw data preserves additional fields such as education, qualifications, benefits, responsibilities, skills, compensation tiers, locations and custom metadata. Fields not provided by an employer remain null.

Details are fetched only for jobs selected for this export. Workday detail responses are reused within the collection pass. Ashby compensation is requested once per board. A blocked detail request does not discard the summary posting: it is marked `failed` with an error and remains in the detailed export. A response without a description is marked `missing_description`.

Employer API adapters: Greenhouse, Lever, Ashby, Workday, SmartRecruiters and Workable. Public JobPosting JSON-LD handles Kula, IQVIA, Guardant and Eightfold pages; SuccessFactors also supports its rendered description container, including nested spans. Other supported summary platforms use the same JSON-LD fallback and report missing descriptions explicitly. Never substitute an entire navigation page for a JD.

## Database draft export

| Collected value | public.jobs field |
|---|---|
| Title, company, full plain-text JD, location | job_role_title, company_name, job_description, location |
| Employer application URL, or job page containing the application route | external_apply_url |
| Explicit employment/workplace labels | employment_type, work_model |
| Disclosed whole-number annual salary, known currency | salary_min, salary_max, currency |
| Structured qualification/requirement text | requirements, using existing section/items array format |
| Explicit structured months of experience, exactly convertible to years | experience_required |
| Employer posting date | published_at |
| Explicit country matched to the reference lookup | country_id |
| Collector and platform | source_service=techjobs, job_source=platform |

Each draft has a stable UUID derived from company/platform/source job ID. An eventual importer must reconcile existing rows by source/application URL before inserting; existing database rows may use unrelated UUIDs. This export does not implement DB synchronization.

Records without a full JD are excluded from the DB file and logged in its `.rejected.jsonl` companion. Drafts are not automatically published. Unknown employment/workplace labels use `unknown` and require review before publication. Missing location uses `Unknown`; the source value remains available in the full detail file.

The DB salary columns are integers and have no period column. Hourly, monthly, fractional, or period-unknown salaries are preserved in the detail export and omitted from DB salary bounds. Multiple geographical bands stay in raw compensation data rather than becoming a fabricated single range. Currency is never defaulted to USD for an undisclosed salary.

Visa fields follow the current DB constraint: status remains `unknown`, assessment/evidence fields remain null, and the legacy boolean is false. This boolean is not evidence that sponsorship is unavailable. No sponsorship inference or skill-ID assignment is performed. Skill associations require matching employer-provided skills to the database vocabulary.

Expiry, department, salary period/evidence, raw source JSON and source job ID do not have dedicated columns in the inspected table. Keep the full detail export alongside DB drafts; a future schema migration would be needed to store these separately.

## Collected examples

`jobs_details_sample.jsonl` contains six real postings from the expansion platforms. `jobs_details_other_sample.jsonl` contains five real postings covering the other sector platforms. All eleven sample descriptions were collected. This is sample coverage, not a bulk backfill of all 246 sector employers.

`jobs_insulet_details.jsonl`, `jobs_insulet_details.csv` and `jobs_insulet_db.jsonl` were produced by the actual CLI with two postings. Both include full descriptions; the DB file contains two draft records. Application flow submission was not performed.

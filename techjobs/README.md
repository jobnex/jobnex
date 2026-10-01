# techjobs

Pulls job postings straight from company career systems, keeps only US jobs by default, and shows you what's **new since the last check**. Run `python techjobs.py --list-companies` for the current registry count. Coverage now includes biotech, pharma, agriculture, and bioinformatics employers; see `BIO_COVERAGE.md` for checked results and remaining candidates.

## Setup
```bash
pip install -r requirements.txt
```

## Usage
```bash
python techjobs.py                          # first run = baseline + last 24h of postings
python techjobs.py                          # later runs = only brand-new postings
python techjobs.py --watch 10               # keep checking every 10 minutes
python techjobs.py -k engineer -k scientist -x manager      # title filters
python techjobs.py -c amazon -c microsoft -c nvidia          # specific companies
python techjobs.py --all --since 48 --csv jobs.csv           # everything posted in last 48h → CSV
python techjobs.py --list-companies
python techjobs.py --sector life-sciences --all --bio-roles --csv bio_roles.csv
python techjobs.py --sector agriculture --all --any-country --csv agriculture.csv
python techjobs.py --sector life-sciences --all --bio-roles --details --json jobs_full_details.jsonl --db-json jobs_db_drafts.jsonl
```

| Flag | What it does |
|---|---|
| `-k/--keyword` | title must contain one of these (repeatable) |
| `-x/--exclude` | drop titles containing this |
| `-c/--company` | only companies whose name contains this |
| `--ats` | only this backend; use `--help` for all supported platforms |
| `--sector` | life-sciences, biotech, pharma, agriculture, or bioinformatics employers (repeatable) |
| `--bio-roles` | scientific, clinical, regulatory, agriculture, quality, and engineering titles; no seniority exclusions |
| `--watch MIN` | loop forever, print new jobs every MIN minutes |
| `--all` | show all matching open jobs, not just new |
| `--since HOURS` | only jobs posted in the last N hours |
| `--max-per-company` | newest N postings pulled from the big boards (default 300) |
| `--strict-us` | drop plain "Remote" jobs with no country |
| `--any-country` | turn off the US filter |
| `--csv / --json` | append results to a CSV / JSONL file |
| `--details` | full JD, disclosed salary/currency/period, application URL, employment/workplace labels and raw employer details |
| `--db-json` | draft records matching trail_dev.public.jobs; implies --details; exports a file without writing to Neon |
| `--reset` | forget seen jobs, start a new baseline |

## How it works

See [JOB_DETAILS.md](JOB_DETAILS.md) for database mapping, missing-field handling and collected examples. Salary is collected only when disclosed. Use new filenames for fresh exports; detailed CSV cannot append to an existing summary CSV.
- **Greenhouse / Lever / Ashby**: public JSON board APIs, one request per company.
- **Workday** (NVIDIA, Salesforce, Adobe): the `/wday/cxs/.../jobs` endpoint, newest first; new jobs get one detail call to read the country.
- **Amazon**: `amazon.jobs/en/search.json` (US, sorted by most recent).
- **Microsoft / Netflix**: Eightfold careers APIs.
- **SuccessFactors**: paginated public search tables (AGCO, Bunge, Novo Nordisk, KWS, Yara).
- **Kula / Workable**: public job data (10x Genomics, Editas Medicine, Ascendis Pharma).
- **IQVIA / Guardant Health**: the same public job data used by the employers' own career sites.
- **Apple / Google**: parse the JSON embedded in their search result pages.
- Seen job IDs live in `.techjobs_seen.json`, which is what makes "new" work. Swap this for Postgres later: the key is `ats:company:job_id`.

## Adding companies
Edit `companies.py`. Look at the company's "Apply" link to find which system it uses:
`boards.greenhouse.io/<slug>` → GREENHOUSE, `jobs.lever.co/<slug>` → LEVER, `jobs.ashbyhq.com/<slug>` → ASHBY, `<tenant>.wd5.myworkdayjobs.com/<site>` → WORKDAY.

## Notes
- **Meta** isn't included. Its careers site uses a private GraphQL API with rotating tokens.
- Apple, Google, Kula, IQVIA, and SuccessFactors use public page data. Page redesigns can require parser updates; failures are reported rather than treated as empty boards.
- Keep `--watch` at ≥5 minutes to be polite and avoid rate limits.

## Tests
```bash
pytest -q tests        # offline, uses canned API responses
```

## Life-science snapshots and coverage checks

`jobs_bio_all.csv` contains all roles matching the US policy at checked sector employers. `jobs_bio_roles.csv` keeps the scientific/technical tracks, including internships, management, and principal roles. `jobs_bio_all.jsonl` contains the same all-role snapshot as newline-delimited JSON. Sector groups and title tracks live in `sectors.py`; employers can belong to multiple groups.

These snapshots come from inspected batches of at most six employers, not an exhaustive worldwide job inventory. Large-board checks request up to 40 postings; small public boards may return their entire list. Use the main CLI with a larger `--max-per-company` for a broader collection. `--any-country` includes global jobs. Plain Remote and blank locations follow the existing default US policy; `--strict-us` drops these ambiguous locations.

To extend coverage, put at most six source configs in `sector_candidates.json`, then run `python sector_probe.py sector_candidates.json`. Inspect the printed job samples, board identity, and errors recorded in `sector_checks.json`. After checking successful employers, run `python register_sector.py` and update their groups in `sectors.py`. Run `python build_bio_outputs.py` to regenerate snapshots and `BIO_COVERAGE.md`; add `--record-seen` to save collected job IDs in the existing baseline. Failed or empty candidates remain in the report and are not silently added.

Collection `--csv` and `--json` flags append. Use a fresh filename for a new snapshot. Posting dates are supplied by employers and may reflect updates or reposts; undated rows are not proof of a recent posting. Workday maintenance redirects are reported separately from empty boards and can recover on retry.

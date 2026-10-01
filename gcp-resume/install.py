from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
app = Path(r'C:\Users\desir\Projects\JD_match\incoming-my-app-2b\my-app')
for source in (root / 'app').rglob('*'):
    if source.is_file():
        destination = app / source.relative_to(root / 'app')
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
for name in ['JobCard', 'PremiumJobCard', 'JobDescriptionPanel']:
    path = app / 'components' / (name + '.tsx')
    text = path.read_text(encoding='utf-8')
    if 'useTailorResume' not in text:
        text = text.replace('import { useRouter, usePathname }', 'import { useTailorResume } from "@/lib/use-tailor-resume";\nimport { useRouter, usePathname }')
        text = text.replace('const router = useRouter();', 'const router = useRouter();\n  const { start: tailor, busy: tailoring } = useTailorResume();')
        text = text.replace('router.push(`/job-hunt/resumes?jobId=${encodeURIComponent(job.id)}`);', 'await tailor(job.id);')
        text = text.replace('onClick={async (e) => {', 'disabled={tailoring}\n            onClick={async (e) => {')
        text = text.replace('<span>Tailor Resume</span>', '<span>{tailoring ? "Queuing…" : "Tailor Resume"}</span>')
        path.write_text(text, encoding='utf-8')
path = app / 'next.config.ts'
text = path.read_text(encoding='utf-8').replace('/* config options here */', 'output: "standalone",')
path.write_text(text, encoding='utf-8')
path = app / 'app/api/resume-generations/route.ts'
text = path.read_text(encoding='utf-8').replace('!process.env.OPENROUTER_API_KEY || ', '')
path.write_text(text, encoding='utf-8')
path = app / 'app/actions/resume.ts'
text = path.read_text(encoding='utf-8').replace('z.number().int().min(1).max(5)', 'z.union([z.literal(2), z.literal(3), z.literal(5), z.literal(6)])')
path.write_text(text, encoding='utf-8')
print('Installed direct tailoring and deployment source')

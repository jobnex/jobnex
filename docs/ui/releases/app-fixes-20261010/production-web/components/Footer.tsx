import Link from "next/link";
import { StrawberryLogo } from "@/components/ui/StrawberryLogo";

export function Footer() {
  return <footer className="bg-[#111827] text-white rounded-t-xl px-4 pt-8 pb-28 md:pb-8 mt-12 dark:bg-[#0C0D11]">
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-col md:flex-row justify-between gap-6 border-b border-white/10 pb-6">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold"><StrawberryLogo size="sm" /><span>strawberry Jobs</span></Link>
        <nav aria-label="Resources" className="flex flex-wrap gap-5 text-sm">
          <Link href="/job-hunt">For Candidates</Link>
          <Link href="/guidelines">Our Guidelines</Link>
          <Link href="/contact">Support</Link>
        </nav>
      </div>
      <div className="mt-6 flex flex-wrap justify-between gap-4 text-sm text-gray-300">
        <p>&copy; {new Date().getFullYear()} Strawberry Jobs.</p>
        <div className="flex gap-6"><Link href="/privacy">Privacy information</Link><Link href="/terms">Terms of use</Link></div>
      </div>
    </div>
  </footer>;
}

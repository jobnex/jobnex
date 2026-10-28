import { JobHuntSidebar } from "@/components/JobHuntSidebar";

export default function JobHuntLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col md:flex-row w-full bg-bg-page gap-[var(--space-m)] py-[var(--space-m)] fluid-container">
      <JobHuntSidebar />

      {/* Main Content */}
      <main className="flex-1 min-w-0 relative">
        {children}
      </main>
    </div>
  );
}

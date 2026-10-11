import { JobHuntSidebar } from "@/components/JobHuntSidebar";

export default function JobHuntLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex w-full bg-bg-page gap-6 p-6 md:p-8 max-w-[1440px] mx-auto">
      <JobHuntSidebar />

      {/* Main Content */}
      <main className="flex-1 min-w-0 relative">
        {children}
      </main>
    </div>
  );
}

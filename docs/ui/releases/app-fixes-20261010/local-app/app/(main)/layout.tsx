import { BackgroundResumeTasks } from "@/components/BackgroundResumeTasks";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ApplyModal } from "@/components/ApplyModal";
import { TailorResumeModal } from "@/components/TailorResumeModal";
import { FloatingBottomNav } from "@/components/FloatingBottomNav";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col pb-24 md:pb-0">
        {children}
      </main>
      <Footer />
      <FloatingBottomNav />
      <ApplyModal />
      <BackgroundResumeTasks />
      <TailorResumeModal />
    </>
  );
}

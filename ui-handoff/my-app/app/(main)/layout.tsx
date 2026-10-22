import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackgroundResumeTasks } from "@/components/BackgroundResumeTasks";
import { FloatingBottomNav } from "@/components/FloatingBottomNav";

const ApplyModal = dynamic(() => import("@/components/ApplyModal").then((m) => m.ApplyModal));
const TailorResumeModal = dynamic(() => import("@/components/TailorResumeModal").then((m) => m.TailorResumeModal));

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col pb-24 lg:pb-0">
        {children}
      </main>
      <Footer />
      <FloatingBottomNav />
      <ApplyModal />
      <TailorResumeModal />
      <BackgroundResumeTasks />
    </>
  );
}

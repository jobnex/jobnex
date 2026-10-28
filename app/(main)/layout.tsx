import { TailorResumeModal } from "@/components/TailorResumeModal";
import { BackgroundResumeTasks } from "@/components/BackgroundResumeTasks";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ApplyModal } from "@/components/ApplyModal";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <Footer />
      <ApplyModal />
      <TailorResumeModal />
      <BackgroundResumeTasks />
    </>
  );
}

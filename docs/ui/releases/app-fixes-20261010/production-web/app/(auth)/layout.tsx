export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-bg-page text-text-primary transition-colors duration-200">
      <main className="flex-1 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  );
}



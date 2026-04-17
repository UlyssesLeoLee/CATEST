import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@catest/ui";
import { getSession, getUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { IntelSubNav } from "@/components/IntelSubNav";
import { IntelSidebarItems } from "@/components/IntelSidebarItems";

export const metadata: Metadata = {
  title: "CATEST — Knowledge Base",
  description: "Identity-aware Knowledge Management",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  
  if (!session) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  const user = await getUser(session.userId as string);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050505] text-zinc-100 font-sans antialiased overflow-hidden">
        <AppShell
          activeApp="rag"
          subNav={<IntelSubNav />}
          sidebarSubNav={<IntelSidebarItems />}
          user={user ? {
            email: user.email,
            displayName: user.display_name,
            role: user.role
          } : undefined}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

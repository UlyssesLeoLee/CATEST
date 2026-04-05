import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@catest/ui";
import { getSession, getUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "CATEST — Workspace",
  description: "Project Workspace powered by CATEST",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Auth redirect is handled by middleware (redirects to /login page which
  // does a client-side hop to the gateway's login). Layout just renders
  // a minimal shell when unauthenticated (e.g. for the /login redirect page).
  if (!session) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  const user = await getUser(session.userId);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050505] text-zinc-100 font-sans antialiased overflow-hidden">
        <AppShell
          activeApp="workspace"
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

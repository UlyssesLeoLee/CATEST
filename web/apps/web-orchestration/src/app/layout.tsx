import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@catest/ui";
import { getSession, getUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "CATEST — Orchestration",
  description: "AI Orchestration & Private Memory Domain",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user: { email: string; display_name?: string; role?: string } | undefined;

  try {
    const session = await getSession();
    if (!session) {
      return (
        <html lang="en">
          <body>{children}</body>
        </html>
      );
    }
    user = await getUser(session.userId as string);
  } catch {
    // Auth service unavailable — render without user context (dev mode)
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050505] text-zinc-100 font-sans antialiased overflow-hidden">
        <AppShell
          activeApp="orchestration"
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

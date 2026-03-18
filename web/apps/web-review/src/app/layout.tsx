import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@catest/ui";
import { getSession, getUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "CATEST — Review Console",
  description: "Secure Audit & Review Console",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  
  if (!session) {
    const isSaaS = process.env.NEXT_PUBLIC_SAAS_MODE === "true";
    const loginUrl = isSaaS ? "/login" : `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || "33000"}/login`;
    redirect(loginUrl);
  }

  const user = await getUser(session.userId as string);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050505] text-zinc-100 font-sans antialiased overflow-hidden">
        <AppShell 
          activeApp="review" 
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

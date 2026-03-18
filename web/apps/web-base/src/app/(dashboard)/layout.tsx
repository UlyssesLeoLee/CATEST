import { AppShell } from "@catest/ui";
import { getSession, getUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  
  if (!session) {
    redirect("/login");
  }

  const user = await getUser(session.userId);

  return (
    <AppShell 
      activeApp="base" 
      user={user ? {
        email: user.email,
        displayName: user.display_name,
        role: user.role
      } : undefined}
    >
      {children}
    </AppShell>
  );
}

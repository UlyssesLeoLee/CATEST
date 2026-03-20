import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catest",
  description: "Say Co., Ltd.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050505] text-zinc-100 font-sans antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}

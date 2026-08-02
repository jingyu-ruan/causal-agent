import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://causal-agent-sage.vercel.app"),
  title: {
    default: "Causal Decision Agent",
    template: "%s · Causal Decision Agent",
  },
  description: "Build a causal study through conversation, watch the tools run, and keep every decision tied to inspectable evidence.",
  openGraph: {
    title: "Causal Decision Agent",
    description: "Build the study through conversation.",
    type: "website",
    images: [{ url: "/og-causal-decision-v3.png", width: 1733, height: 907, alt: "Causal Decision conversation and execution workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Causal Decision Agent",
    description: "Build the study through conversation.",
    images: ["/og-causal-decision-v3.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <div className="min-h-screen bg-background text-foreground">
            <Sidebar />
            <main className="min-h-[calc(100vh-4.25rem)]">{children}</main>
          </div>
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/ui/navbar";
import { PerformanceModeProvider } from "@/contexts/performance-mode-context";
import { PageTransition } from "@/components/ui/page-transition";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daniel W Liu",
  description: "Portfolio website for Daniel W Liu - Computer Science and Finance student at University of Waterloo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/shared/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PerformanceModeProvider>
          <PageTransition>
            <Navbar />
            {children}
          </PageTransition>
        </PerformanceModeProvider>
      </body>
    </html>
  );
}

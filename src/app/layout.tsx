import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FinCloud LMS — Loan Management System",
    template: "%s · FinCloud LMS",
  },
  description:
    "FinCloud Loan Management System — a premium demo workspace covering lead, credit, sanction, disbursement and collection operations.",
  applicationName: "FinCloud LMS",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#071c27",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#f4f7f6] font-sans">{children}</body>
    </html>
  );
}

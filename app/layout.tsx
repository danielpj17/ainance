import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import DemoModeBanner from "@/components/DemoModeBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Ainance Demo - AI Trading Platform",
  description: "AI-powered trading platform with real-time analytics - Demo Mode",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthGuard>
          <DemoModeBanner />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-20 pt-0">
              {children}
            </main>
          </div>
        </AuthGuard>
      </body>
    </html>
  )
}

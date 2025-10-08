import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Button } from "@/components/ui/button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ainance",
  description: "AI-powered trading platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="flex justify-between items-center p-4 bg-gray-800 text-white">
          <div className="text-xl font-bold">Ainance</div>
          <Button variant="outline" className="text-white border-white hover:bg-white hover:text-gray-800">
            Logout
          </Button>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}

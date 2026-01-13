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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Prevent body scroll locking by Radix UI
                const originalSetAttribute = Element.prototype.setAttribute;
                Element.prototype.setAttribute = function(name, value) {
                  if (name === 'style' && this === document.body) {
                    const style = value || '';
                    // Prevent overflow: hidden from being set on body
                    if (style.includes('overflow') && style.includes('hidden')) {
                      return;
                    }
                  }
                  return originalSetAttribute.call(this, name, value);
                };
                
                // Also watch for style property changes
                const body = document.body;
                const observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(mutation) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                      const style = body.getAttribute('style') || '';
                      if (style.includes('overflow') && style.includes('hidden')) {
                        body.style.overflow = '';
                      }
                    }
                  });
                });
                observer.observe(body, { attributes: true, attributeFilter: ['style'] });
              })();
            `,
          }}
        />
      </head>
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

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
                // Prevent body scroll locking and padding changes by Radix UI
                const body = document.body;
                const originalSetAttribute = Element.prototype.setAttribute;
                
                Element.prototype.setAttribute = function(name, value) {
                  if (name === 'style' && this === body) {
                    const style = value || '';
                    // Prevent overflow: hidden and padding-right from being set on body
                    if (style.includes('overflow') && style.includes('hidden')) {
                      return;
                    }
                    if (style.includes('padding-right')) {
                      // Allow padding-right only if it's removing it (empty value)
                      if (!value || !value.includes('padding-right')) {
                        return originalSetAttribute.call(this, name, value);
                      }
                      // Block padding-right additions
                      const newStyle = style.replace(/padding-right[^;]*;?/gi, '');
                      return originalSetAttribute.call(this, name, newStyle || '');
                    }
                  }
                  return originalSetAttribute.call(this, name, value);
                };
                
                // Watch for style property changes and revert unwanted ones
                const observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(mutation) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                      const style = body.getAttribute('style') || '';
                      let changed = false;
                      let newStyle = style;
                      
                      // Remove overflow: hidden
                      if (style.includes('overflow') && style.includes('hidden')) {
                        newStyle = newStyle.replace(/overflow[^;]*hidden[^;]*;?/gi, '');
                        changed = true;
                      }
                      
                      // Remove padding-right (Radix adds this to compensate for scrollbar)
                      if (style.includes('padding-right') && !style.includes('padding-right: 0')) {
                        newStyle = newStyle.replace(/padding-right[^;]*;?/gi, '');
                        changed = true;
                      }
                      
                      if (changed) {
                        body.setAttribute('style', newStyle.trim() || '');
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

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
                // Prevent body and html scroll locking and layout changes by Radix UI
                const body = document.body;
                const html = document.documentElement;
                const originalSetAttribute = Element.prototype.setAttribute;
                const originalStyleSetter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')?.set;
                
                // Intercept setAttribute calls
                Element.prototype.setAttribute = function(name, value) {
                  if (name === 'style' && (this === body || this === html)) {
                    const style = value || '';
                    // Block any layout-affecting changes
                    if (style.includes('overflow') && style.includes('hidden')) {
                      return;
                    }
                    if (style.includes('padding-right') || style.includes('paddingLeft')) {
                      const newStyle = style.replace(/padding-(right|left)[^;]*;?/gi, '');
                      return originalSetAttribute.call(this, name, newStyle.trim() || '');
                    }
                    if (style.includes('margin-right') || style.includes('marginLeft')) {
                      const newStyle = style.replace(/margin-(right|left)[^;]*;?/gi, '');
                      return originalSetAttribute.call(this, name, newStyle.trim() || '');
                    }
                  }
                  return originalSetAttribute.call(this, name, value);
                };
                
                // Watch for style property changes on both body and html
                const observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(mutation) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                      const target = mutation.target;
                      if (target === body || target === html) {
                        const style = target.getAttribute('style') || '';
                        let changed = false;
                        let newStyle = style;
                        
                        // Remove overflow: hidden
                        if (style.includes('overflow') && style.includes('hidden')) {
                          newStyle = newStyle.replace(/overflow[^;]*hidden[^;]*;?/gi, '');
                          changed = true;
                        }
                        
                        // Remove padding-right/left
                        if (style.includes('padding-right') || style.includes('padding-left')) {
                          newStyle = newStyle.replace(/padding-(right|left)[^;]*;?/gi, '');
                          changed = true;
                        }
                        
                        // Remove margin-right/left
                        if (style.includes('margin-right') || style.includes('margin-left')) {
                          newStyle = newStyle.replace(/margin-(right|left)[^;]*;?/gi, '');
                          changed = true;
                        }
                        
                        if (changed) {
                          target.setAttribute('style', newStyle.trim() || '');
                        }
                      }
                    }
                  });
                });
                observer.observe(body, { attributes: true, attributeFilter: ['style'] });
                observer.observe(html, { attributes: true, attributeFilter: ['style'] });
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

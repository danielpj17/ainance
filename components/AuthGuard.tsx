"use client";

import { isDemoMode } from "@/lib/demo-user";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  // In demo mode, always allow access - no auth checks needed
  // All users share the same demo account
  
  if (isDemoMode()) {
    return <>{children}</>;
  }

  // Real authentication logic would go here when DEMO_MODE is disabled
  // For now, always allow access
  return <>{children}</>;
}




"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // Optionally log error
    // console.error(error);
  }, [error]);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 dark:bg-red-900 p-8">
      <h1 className="text-3xl font-bold text-red-700 dark:text-red-200 mb-4">Something went wrong</h1>
      <p className="mb-6 text-lg text-red-600 dark:text-red-100">{error.message || "An unexpected error occurred."}</p>
      <div className="flex gap-4">
        <Button onClick={() => reset()}>Try Again</Button>
        <Button variant="outline" onClick={() => router.push("/")}>Go Home</Button>
      </div>
    </div>
  );
}

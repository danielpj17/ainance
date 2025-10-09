"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";

export default function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">🌞</span>
      <Switch checked={dark} onCheckedChange={setDark} />
      <span className="text-xs">🌙</span>
    </div>
  );
}




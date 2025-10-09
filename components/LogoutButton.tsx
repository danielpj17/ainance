"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <Button
      variant="outline"
      className="text-white border-white hover:bg-white hover:text-gray-800"
      onClick={handleLogout}
    >
      Logout
    </Button>
  );
}




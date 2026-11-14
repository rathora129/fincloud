"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fincloud-ui]", error);
  }, [error]);

  return (
    <div className="surface rounded-2xl py-10">
      <ErrorState
        title="This view could not be rendered"
        description="An unexpected error occurred while loading the workspace. You can retry, or return to the dashboard."
        action={
          <Button onClick={reset} variant="outline">
            <RotateCcw className="h-4 w-4" /> Retry
          </Button>
        }
      />
    </div>
  );
}

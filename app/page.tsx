import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Newsletter Engine
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          AI-powered content curation for Link's internal newsletter
        </p>
        <Button asChild size="lg">
          <Link href="/dashboard">
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

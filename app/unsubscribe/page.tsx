import { Suspense } from "react";
import UnsubscribeContent from "./unsubscribe-content";

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-24">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold mb-4">Loading...</h1>
          </div>
        </main>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}

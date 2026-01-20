export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-4">
          Link AI Newsletter Engine
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400">
          Autonomous AI-powered newsletter curation and delivery system
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <a
            href="/dashboard/review"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

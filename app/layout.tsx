import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeSync } from "@/components/theme-sync";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Link AI Newsletter Engine",
  description: "Autonomous AI-powered newsletter curation and delivery system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="linkroad-dark"
          enableSystem
          disableTransitionOnChange
          themes={[
            "light",
            "dark",
            "system",
            "linkroad-dark",
            "linkroad-slate",
            "linkroad-ocean",
            "linkroad-ember",
            "linkroad-print",
            "linkroad-print-graphite",
            "linkroad-print-carbon",
            "linkroad-light",
            "linkroad-light-sand",
            "linkroad-light-mist",
            "linkroad-light-azure",
            "linkroad-light-citrus",
          ]}
          value={{
            "linkroad-dark": "theme-linkroad-dark",
            "linkroad-slate": "theme-linkroad-slate",
            "linkroad-ocean": "theme-linkroad-ocean",
            "linkroad-ember": "theme-linkroad-ember",
            "linkroad-print": "theme-linkroad-print",
            "linkroad-print-graphite": "theme-linkroad-print-graphite",
            "linkroad-print-carbon": "theme-linkroad-print-carbon",
            "linkroad-light": "theme-linkroad-light",
            "linkroad-light-sand": "theme-linkroad-light-sand",
            "linkroad-light-mist": "theme-linkroad-light-mist",
            "linkroad-light-azure": "theme-linkroad-light-azure",
            "linkroad-light-citrus": "theme-linkroad-light-citrus",
          }}
        >
          <ThemeSync />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

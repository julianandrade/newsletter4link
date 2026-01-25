import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { isGraphConfigured } from "@/lib/email/graph-client";

export const dynamic = "force-dynamic";

interface Provider {
  id: "resend" | "graph";
  name: string;
  configured: boolean;
  fromEmail: string | null;
}

/**
 * GET /api/email/providers
 * Returns available email providers and their configuration status
 */
export async function GET() {
  try {
    const providers: Provider[] = [];

    // Check Resend configuration
    const resendConfigured = !!config.email.resend.apiKey;
    providers.push({
      id: "resend",
      name: "Resend",
      configured: resendConfigured,
      fromEmail: resendConfigured ? config.email.from.email : null,
    });

    // Check Microsoft Graph configuration
    const graphConfigured = isGraphConfigured();
    providers.push({
      id: "graph",
      name: "Microsoft Graph (O365)",
      configured: graphConfigured,
      fromEmail: graphConfigured ? config.email.graph.senderEmail || null : null,
    });

    // Get default provider from config
    const defaultProvider = config.email.provider;

    return NextResponse.json({
      success: true,
      providers,
      default: defaultProvider,
    });
  } catch (error) {
    console.error("Error getting email providers:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

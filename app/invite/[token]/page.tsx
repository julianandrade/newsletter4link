import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AcceptInviteForm } from "./accept-invite-form";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  // Look up the invite
  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Invalid Invite</h1>
          <p className="text-muted-foreground mt-2">
            This invite link is invalid or has already been used.
          </p>
        </div>
      </div>
    );
  }

  if (invite.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Invite Expired</h1>
          <p className="text-muted-foreground mt-2">
            This invite has expired. Please ask for a new invitation.
          </p>
        </div>
      </div>
    );
  }

  // Check if user is logged in
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in, redirect to login with return URL
  if (!user) {
    redirect(`/login?redirect=/invite/${token}`);
  }

  // Check if already a member
  const existingMember = await prisma.orgUser.findFirst({
    where: {
      supabaseUserId: user.id,
      organizationId: invite.organizationId,
    },
  });

  if (existingMember) {
    // Already a member, redirect to dashboard
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <AcceptInviteForm
        token={token}
        organizationName={invite.organization.name}
        role={invite.role}
        invitedEmail={invite.email}
        userEmail={user.email || ""}
      />
    </div>
  );
}

import "server-only";
import { Resend } from "resend";
import { renderInvitationEmail } from "./templates/invitation";

let _resend: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!process.env.AUTH_RESEND_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.AUTH_RESEND_KEY);
  return _resend;
}

export function isEmailDeliveryConfigured(): boolean {
  return !!process.env.AUTH_RESEND_KEY;
}

interface SendInvitationOptions {
  to: string;
  workspaceName: string;
  role: "owner" | "admin" | "editor" | "viewer";
  inviterName: string | null;
  inviterEmail: string;
  inviteUrl: string;
  expiresInDays: number;
}

export interface SendInvitationResult {
  ok: boolean;
  delivered: boolean;
  message?: string;
}

export async function sendInvitationEmail(
  opts: SendInvitationOptions,
): Promise<SendInvitationResult> {
  const client = getResendClient();
  if (!client) {
    return {
      ok: true,
      delivered: false,
      message: "Resend not configured (AUTH_RESEND_KEY unset).",
    };
  }

  const from =
    process.env.EMAIL_FROM ?? "OpenCopy <onboarding@resend.dev>";

  const { subject, html, text } = renderInvitationEmail({
    recipientEmail: opts.to,
    workspaceName: opts.workspaceName,
    role: opts.role,
    inviterName: opts.inviterName,
    inviterEmail: opts.inviterEmail,
    inviteUrl: opts.inviteUrl,
    expiresInDays: opts.expiresInDays,
  });

  try {
    const { error } = await client.emails.send({
      from,
      to: opts.to,
      subject,
      html,
      text,
    });
    if (error) {
      return { ok: false, delivered: false, message: error.message };
    }
    return { ok: true, delivered: true };
  } catch (err) {
    return { ok: false, delivered: false, message: (err as Error).message };
  }
}

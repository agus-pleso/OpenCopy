/**
 * Invitation email template — HTML + plain-text fallback. Inline styles
 * (most email-safe), no external assets, brand-toned.
 */

interface InvitationEmailProps {
  recipientEmail: string;
  workspaceName: string;
  role: "owner" | "admin" | "editor" | "viewer";
  inviterName: string | null;
  inviterEmail: string;
  inviteUrl: string;
  expiresInDays: number;
}

const ROLE_HINT: Record<InvitationEmailProps["role"], string> = {
  owner: "Full control of the workspace.",
  admin: "Manages members, provider keys, and workspace settings.",
  editor: "Read/write across voices, agents, documents, library.",
  viewer: "Read-only access.",
};

export function renderInvitationEmail(props: InvitationEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const inviterLabel = props.inviterName
    ? `${props.inviterName} (${props.inviterEmail})`
    : props.inviterEmail;
  const subject = `You're invited to join ${props.workspaceName} on OpenCopy`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0e0e0e;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;border:1px solid #e5dfd5;border-radius:12px;overflow:hidden;">
      <tr><td style="height:4px;background:linear-gradient(to right,#c4501a 0%,rgba(196,80,26,0.6) 50%,transparent 100%);"></td></tr>
      <tr>
        <td style="padding:32px 36px 8px;">
          <p style="margin:0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;">You&apos;re invited</p>
          <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;letter-spacing:-0.02em;">Join ${escapeHtml(props.workspaceName)}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 36px 24px;color:#3a3a3a;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">${escapeHtml(inviterLabel)} invited you to join <strong>${escapeHtml(props.workspaceName)}</strong> on OpenCopy as a <strong>${escapeHtml(props.role)}</strong>.</p>
          <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${escapeHtml(ROLE_HINT[props.role])}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
            <tr>
              <td style="background:#c4501a;border-radius:6px;">
                <a href="${props.inviteUrl}" style="display:inline-block;padding:11px 20px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:-0.01em;">
                  Accept invitation
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#6b7280;font-size:12px;">Or copy this link:<br><a href="${props.inviteUrl}" style="color:#c4501a;word-break:break-all;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;">${escapeHtml(props.inviteUrl)}</a></p>
          <p style="margin:18px 0 0;color:#6b7280;font-size:12px;">This invitation expires in ${props.expiresInDays} day${props.expiresInDays === 1 ? "" : "s"}.</p>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0;color:#9b9b9b;font-size:11px;text-align:center;text-transform:uppercase;letter-spacing:0.14em;">OpenCopy · open-source AI copywriting</p>
  </div>
</body>
</html>`;

  const text = `You're invited to join ${props.workspaceName} on OpenCopy.

${inviterLabel} invited you to join as ${props.role}.
${ROLE_HINT[props.role]}

Accept the invitation: ${props.inviteUrl}

This link expires in ${props.expiresInDays} day${props.expiresInDays === 1 ? "" : "s"}.

— OpenCopy`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

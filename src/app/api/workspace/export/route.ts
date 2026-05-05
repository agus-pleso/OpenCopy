import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { exportWorkspace } from "@/lib/export/workspace-export";

const bodySchema = z.object({
  includeEmbeddings: z.boolean().default(true),
  passphrase: z.string().min(8).max(256).optional(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ws = await getCurrentWorkspace().catch(() => null);
  if (!ws) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }
  // Only the owner gets to export — same bar we use elsewhere for
  // workspace-wide destructive / sensitive actions.
  if (ws.role !== "owner") {
    return NextResponse.json(
      { error: "only the workspace owner can export" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: `invalid body: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const me = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  const { filename, bytes } = await exportWorkspace(db, ws.workspace.id, {
    includeEmbeddings: body.includeEmbeddings,
    passphrase: body.passphrase ?? null,
    exporterEmail: me?.email ?? null,
    appVersion: process.env.npm_package_version,
  });

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
    },
  });
}

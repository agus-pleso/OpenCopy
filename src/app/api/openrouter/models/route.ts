import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { listOpenRouterModels } from "@/lib/ai/openrouter";
import { getCurrentWorkspace } from "@/lib/auth/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspace } = await getCurrentWorkspace();

    const keyRow = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.workspaceId, workspace.id),
        eq(apiKeys.provider, "openrouter"),
      ),
    });

    let apiKey: string | undefined;
    if (keyRow?.ciphertext) {
      try {
        apiKey = decryptSecret(keyRow.ciphertext);
      } catch {
        apiKey = undefined;
      }
    }

    const models = await listOpenRouterModels(apiKey);
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

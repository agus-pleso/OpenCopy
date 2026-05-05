import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { db } from "@/db/client";
import {
  ImportError,
  importWorkspace,
  parseOpenCopy,
} from "@/lib/export/workspace-import";

export const runtime = "nodejs";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB cap; configure server-side if larger packages appear

/**
 * POST /api/workspace/import
 *
 *   multipart form-data with:
 *     - file: the .opencopy bytes
 *     - passphrase: optional, required if file is encrypted
 *     - mode: "preview" | "commit"
 *
 * Preview mode parses the file and returns the manifest so the UI can show
 * a summary; commit mode actually inserts a new workspace and returns its id.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `invalid form: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `file too large (${file.size} bytes; cap is ${MAX_BYTES})`,
      },
      { status: 413 },
    );
  }

  const passphraseRaw = form.get("passphrase");
  const passphrase =
    typeof passphraseRaw === "string" && passphraseRaw.length > 0
      ? passphraseRaw
      : undefined;
  const mode = (form.get("mode") || "preview").toString();

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseOpenCopy(buf, passphrase);
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "ENCRYPTED" ? 401 : 400 },
      );
    }
    return NextResponse.json(
      { error: `parse failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (mode === "preview") {
    return NextResponse.json({ manifest: parsed.manifest });
  }

  if (mode !== "commit") {
    return NextResponse.json(
      { error: `unknown mode: ${mode}` },
      { status: 400 },
    );
  }

  try {
    const result = await importWorkspace(db, parsed, session.user.id);
    return NextResponse.json({ workspaceId: result.workspaceId });
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: `import failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

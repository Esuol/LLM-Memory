import { NextResponse } from "next/server";
import { listNamespaces } from "@/app/code-chat/api/index";

/**
 * @description 列出已索引的 namespaces
 */
export async function GET() {
  try {
    const namespaces = await listNamespaces();
    return NextResponse.json({ success: true, namespaces });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "list failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


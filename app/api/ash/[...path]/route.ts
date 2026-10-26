import { handleAsh } from "@/server/dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

async function entry(req: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return handleAsh(req, path ?? []);
}

export const GET = entry;
export const POST = entry;
export const DELETE = entry;

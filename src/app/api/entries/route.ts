import { list, put } from "@/lib/db";
import { toEntry } from "@/lib/entries";
import { handler } from "@/lib/http";

export const GET = handler(async () => list("entries"));

export const POST = handler(async (req: Request) => put("entries", toEntry(await req.json())));

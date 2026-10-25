import { handler } from "@/lib/http";
import { createMcpKey } from "@/lib/users";

// Make a new connection key for the signed-in user. It replaces the old one and is
// only ever shown in this response.
export const POST = handler(async () => ({ key: await createMcpKey() }));

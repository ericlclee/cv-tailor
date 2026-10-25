import "server-only";
import { ZodError } from "zod";
import { AIError } from "./ai";
import { SignInRequired } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a route handler so thrown errors become `{ error }` JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError || err instanceof AIError || err instanceof SignInRequired) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return Response.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      }
      console.error(err);
      return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
    }
  };
}

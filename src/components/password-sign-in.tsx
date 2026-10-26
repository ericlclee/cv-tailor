"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Input } from "./ui";

// Email and password sign-in, and asking for a set-password link by email.

export function PasswordSignIn({ next, minLength }: { next: string; minLength: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "link" | "sent">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "sign-in") {
        await api("/api/auth/password/login", { body: { email, password } });
        router.replace(next);
        return;
      }
      await api("/api/auth/password/request", { body: { email } });
      setMode("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    }
    setBusy(false);
  }

  if (mode === "sent") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-paper px-3 py-2.5 text-sm leading-relaxed text-ink-2">
          If <strong>{email}</strong> can sign in to CV Tailor, a link to set your password is on its way. It works once and expires in an hour. Check your spam folder if it doesn&apos;t arrive.
        </p>
        <button type="button" onClick={() => setMode("sign-in")} className="self-start text-sm font-medium text-accent">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "link" && <p className="text-sm leading-relaxed text-ink-2">Enter your email and we&apos;ll send you a link to set a new password (at least {minLength} characters).</p>}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode === "sign-in" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" loading={busy}>
        {mode === "sign-in" ? "Sign in" : "Email me a link"}
      </Button>
      <button type="button" onClick={() => (setMode(mode === "sign-in" ? "link" : "sign-in"), setError(""))} className="self-start text-sm font-medium text-accent">
        {mode === "sign-in" ? "Set or reset your password" : "Back to sign in"}
      </button>
    </form>
  );
}

export function SetPasswordForm({ token, email, minLength }: { token: string; email: string; minLength: number }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password/set", { body: { token, password } });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-[15px] leading-relaxed text-ink-2">
        Choose a password for <strong>{email}</strong>. Use at least {minLength} characters.
      </p>
      {/* Lets password managers save the pair. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        New password
        <Input type="password" autoComplete="new-password" required minLength={minLength} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Confirm it
        <Input type="password" autoComplete="new-password" required minLength={minLength} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" loading={busy}>
        Set password and sign in
      </Button>
    </form>
  );
}

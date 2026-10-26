"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Input } from "./ui";

// Email and password sign-in, and setting a password from a link the owner made.

export function PasswordSignIn({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password/login", { body: { email, password } });
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" loading={busy}>
        Sign in
      </Button>
      <p className="text-[13px] leading-relaxed text-muted">No password yet, or forgotten it? Ask the owner for a password link.</p>
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

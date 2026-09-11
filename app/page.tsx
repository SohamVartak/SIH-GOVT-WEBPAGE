"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PortalType = "select" | "user" | "admin";

export default function Home() {
  const router = useRouter();

  const [portal, setPortal] = useState<PortalType>("select");
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setMessage("");
    setIsRegister(false);
  };

  /* =========================================================
     USER / COMPANY LOGIN + REGISTRATION
  ========================================================= */
  const handleUserAuth = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      /* ================= REGISTER ================= */
      if (isRegister) {
        if (!name.trim()) {
          setMessage("Please enter your full name.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.user) {
          setMessage(
            "Registration successful. Your account has been created in Supabase. Please check your email if confirmation is required."
          );

          setIsRegister(false);
          setPassword("");
        }

        return;
      }

      /* ================= LOGIN ================= */
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     GOVERNMENT ADMINISTRATOR LOGIN
  ========================================================= */
  const handleAdminLogin = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      /* ---------- GOV EMAIL CHECK ---------- */
      if (!email.toLowerCase().endsWith("@gov.in")) {
        setMessage(
          "Administrator access requires an official @gov.in email address."
        );
        return;
      }

      /* ---------- LOGIN ---------- */
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) {
        setMessage(error.message);
        return;
      }

      const user = data.user;

      if (!user) {
        setMessage("Unable to verify your administrator account.");
        return;
      }

      /* ---------- PROFILE CHECK ---------- */
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("user_type, is_active, role")
          .eq("id", user.id)
          .single();

      if (profileError) {
        await supabase.auth.signOut();

        setMessage(
          "Administrator profile could not be verified."
        );

        return;
      }

      /* ---------- USER TYPE ---------- */
      if (profile?.user_type !== "GOVERNMENT") {
        await supabase.auth.signOut();

        setMessage(
          "This account is not registered as a government account."
        );

        return;
      }

      /* ---------- ACTIVE ---------- */
      if (profile?.is_active !== true) {
        await supabase.auth.signOut();

        setMessage(
          "This administrator account is currently inactive."
        );

        return;
      }

      /* ---------- ROLE ---------- */
      if (profile?.role !== "National Administrator") {
        await supabase.auth.signOut();

        setMessage(
          "Access denied. National Administrator privileges are required."
        );

        return;
      }

      /* ---------- SUCCESS ---------- */
      router.push("/admin");
    } catch (error) {
      console.error(error);

      setMessage(
        "Something went wrong while verifying the administrator account."
      );
    } finally {
      setLoading(false);
    }
  };

  const backToSelection = () => {
    resetForm();
    setPortal("select");
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* =====================================================
          TRICOLOR ACCENT
      ===================================================== */}
      <div className="gov-tricolor-accent" />

      {/* =====================================================
          HEADER
      ===================================================== */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">

            <img
              src="/ashoka-emblem.png"
              alt="Government of India Emblem"
              className="h-16 w-16 object-contain"
            />

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Government of India
              </p>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Bharat Material Grid
              </h1>

              <p className="text-sm text-slate-500">
                National Material Intelligence &amp; Procurement Platform
              </p>
            </div>
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Secure Access
            </p>

            <p className="text-sm font-medium text-slate-700">
              Government Enterprise Portal
            </p>
          </div>
        </div>
      </header>

      {/* =====================================================
          MAIN AREA
      ===================================================== */}
      <section className="relative flex min-h-[calc(100vh-110px)] items-center justify-center overflow-hidden bg-slate-50 px-4 py-12">

        <div className="absolute inset-0 bg-grid-pattern-light opacity-50" />

        <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

          {/* =================================================
              PORTAL SELECTION
          ================================================= */}
          {portal === "select" && (
            <div className="p-8 sm:p-12">

              {/* TITLE */}
              <div className="mx-auto max-w-3xl text-center">

                <p className="text-sm font-semibold uppercase tracking-wider text-orange-600">
                  Secure Access
                </p>

                <h2 className="mt-3 text-4xl font-bold text-slate-900">
                  Bharat Material Grid
                </h2>

                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500">
                  Select the appropriate portal to continue.
                </p>

              </div>

              {/* =================================================
                  TWO CARDS ONLY
              ================================================= */}
              <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">

                {/* =================================================
                    USER / COMPANY PORTAL
                ================================================= */}
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setPortal("user");
                  }}
                  className="group rounded-2xl border border-slate-200 bg-white p-7 text-left transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg"
                >

                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-50 text-2xl">
                    👤
                  </div>

                  <h3 className="mt-6 text-xl font-bold text-slate-900">
                    User / Company Portal
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Access material search, company records,
                    procurement tools, AI matching and other
                    Bharat Material Grid features.
                  </p>

                  <div className="mt-7 flex items-center justify-between">

                    <span className="text-sm font-semibold text-orange-600">
                      Sign In →
                    </span>

                    <span className="text-sm font-semibold text-slate-500">
                      Create Account
                    </span>

                  </div>

                </button>

                {/* =================================================
                    GOVERNMENT ADMINISTRATION
                ================================================= */}
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setPortal("admin");
                  }}
                  className="group rounded-2xl border border-slate-200 bg-white p-7 text-left transition hover:-translate-y-1 hover:border-red-300 hover:shadow-lg"
                >

                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-2xl">
                    🛡️
                  </div>

                  <h3 className="mt-6 text-xl font-bold text-slate-900">
                    Government Administration
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Restricted administrative access for authorised
                    National Administrators managing the Bharat
                    Material Grid platform.
                  </p>

                  <div className="mt-7 text-sm font-semibold text-red-600">
                    Administrator Login →
                  </div>

                </button>

              </div>

              {/* FOOTER NOTICE */}
              <p className="mt-10 text-center text-xs leading-5 text-slate-400">
                Authorised access only. All activity may be monitored
                and recorded.
              </p>

            </div>
          )}

          {/* =================================================
              USER / COMPANY
          ================================================= */}
          {portal === "user" && (
            <div className="grid md:grid-cols-2">

              {/* LEFT INFORMATION PANEL */}
              <div className="hidden bg-slate-900 p-10 text-white md:flex md:flex-col md:justify-between">

                <div>

                  <div className="mb-8 inline-flex rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Bharat Material Grid
                  </div>

                  <h2 className="text-4xl font-bold leading-tight">
                    Intelligent Material
                    <br />
                    Management
                  </h2>

                  <p className="mt-6 max-w-md text-sm leading-7 text-slate-300">
                    A unified platform for material discovery,
                    data quality, procurement intelligence,
                    company management and cross-organisation
                    material comparison.
                  </p>

                </div>

                <div className="mt-10 grid grid-cols-3 gap-3">

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold">01</p>
                    <p className="mt-1 text-xs text-slate-300">
                      Centralised Data
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold">02</p>
                    <p className="mt-1 text-xs text-slate-300">
                      Smart Search
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold">03</p>
                    <p className="mt-1 text-xs text-slate-300">
                      AI Insights
                    </p>
                  </div>

                </div>
              </div>

              {/* RIGHT FORM */}
              <div className="p-7 sm:p-10">

                <button
                  type="button"
                  onClick={backToSelection}
                  className="mb-6 text-sm font-semibold text-slate-500 hover:text-slate-900"
                >
                  ← Back to portal selection
                </button>

                <div className="mb-8">

                  <p className="text-sm font-semibold text-orange-600">
                    {isRegister
                      ? "Create Account"
                      : "Secure Sign In"}
                  </p>

                  <h2 className="mt-2 text-3xl font-bold text-slate-900">
                    {isRegister
                      ? "Register"
                      : "Welcome back"}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {isRegister
                      ? "Create your Bharat Material Grid account."
                      : "Sign in to access the Bharat Material Grid portal."}
                  </p>

                </div>

                {/* FORM */}
                <form
                  onSubmit={handleUserAuth}
                  className="space-y-5"
                >

                  {/* FULL NAME */}
                  {isRegister && (
                    <div>

                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Full Name
                      </label>

                      <input
                        type="text"
                        value={name}
                        onChange={(e) =>
                          setName(e.target.value)
                        }
                        placeholder="Enter your full name"
                        required
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      />

                    </div>
                  )}

                  {/* EMAIL */}
                  <div>

                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Email Address
                    </label>

                    <input
                      type="email"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      placeholder="Enter your email"
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />

                  </div>

                  {/* PASSWORD */}
                  <div>

                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Password
                    </label>

                    <input
                      type="password"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      placeholder="Enter your password"
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />

                  </div>

                  {/* MESSAGE */}
                  {message && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {message}
                    </div>
                  )}

                  {/* SUBMIT */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading
                      ? "Please wait..."
                      : isRegister
                      ? "Create Account"
                      : "Sign In"}
                  </button>

                </form>

                {/* OR */}
                <div className="my-7 flex items-center gap-3">

                  <div className="h-px flex-1 bg-slate-200" />

                  <span className="text-xs text-slate-400">
                    OR
                  </span>

                  <div className="h-px flex-1 bg-slate-200" />

                </div>

                {/* REGISTER SWITCH */}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setMessage("");
                  }}
                  className="w-full rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {isRegister
                    ? "Already have an account? Sign In"
                    : "New user? Create an Account"}
                </button>

                <p className="mt-6 text-center text-xs leading-5 text-slate-400">
                  By continuing, you agree to the applicable terms
                  and policies governing access to the Bharat Material
                  Grid.
                </p>

              </div>
            </div>
          )}

          {/* =================================================
              GOVERNMENT ADMINISTRATION
          ================================================= */}
          {portal === "admin" && (
            <div className="mx-auto max-w-xl p-7 sm:p-10">

              <button
                type="button"
                onClick={backToSelection}
                className="mb-6 text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                ← Back to portal selection
              </button>

              {/* TITLE */}
              <div className="mb-8">

                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-2xl">
                  🛡️
                </div>

                <p className="mt-6 text-sm font-semibold text-red-600">
                  Restricted Access
                </p>

                <h2 className="mt-2 text-3xl font-bold text-slate-900">
                  Government Administration
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Secure access for authorised National Administrators
                  managing the Bharat Material Grid system.
                </p>

              </div>

              {/* ADMIN FORM */}
              <form
                onSubmit={handleAdminLogin}
                className="space-y-5"
              >

                {/* EMAIL */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Official Government Email
                  </label>

                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    placeholder="administrator@gov.in"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  />

                </div>

                {/* PASSWORD */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </label>

                  <input
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="Enter your password"
                    required
                    minLength={6}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  />

                </div>

                {/* MESSAGE */}
                {message && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {message}
                  </div>
                )}

                {/* BUTTON */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? "Verifying..."
                    : "Administrator Sign In"}
                </button>

              </form>

              {/* ADMIN NOTICE */}
              <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-xs leading-5 text-red-700">
                  Administrator access is restricted to accounts
                  with the <strong>National Administrator</strong>{" "}
                  role and an active government profile.
                </p>
              </div>

            </div>
          )}

        </div>
      </section>
    </main>
  );
}
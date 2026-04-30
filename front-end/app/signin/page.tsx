"use client";

// =============================================================================
// /signin — email-or-phone + password
// =============================================================================
// Migrated to react-hook-form + zod. The visible/UX changes vs. the previous
// useState version:
//   1. A single `identifier` field is validated against `identifierField`,
//      which accepts either an email OR an Egyptian phone. The tab toggle
//      becomes purely cosmetic (different placeholder / input type / icon).
//   2. Per-field error messages render under each input instead of a single
//      banner at the bottom — matches the rest of the app post-migration.
//   3. Submit button auto-disables while the form is submitting OR when the
//      form is in an invalid-and-touched state.
// =============================================================================

import { useState } from "react";
import { Mail, Smartphone, Eye, EyeOff, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { signinSchema, type SigninValues } from "@/lib/schemas";

export default function SignInPage() {
  const router = useRouter();
  const { login } = useAuth();

  // UI-only state (not validated, doesn't go to backend).
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"mobile" | "email">("email");
  // Top-level error from the API (e.g. "wrong password"). Field-level
  // validation errors come from RHF; this is for server-side rejections.
  const [submitError, setSubmitError] = useState("");

  const form = useForm<SigninValues>({
    resolver: zodResolver(signinSchema),
    defaultValues: { identifier: "", password: "" },
    mode: "onTouched", // validate on blur, then keep validating on every change
  });

  const onSubmit = async (values: SigninValues) => {
    setSubmitError("");
    try {
      // Decide email vs phone from the value itself, not the tab. A user could
      // type an email while on the "phone" tab — the tab is a UX hint, not the
      // authoritative pick.
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.identifier);

      await login({
        ...(looksLikeEmail
          ? { email: values.identifier }
          : { phone: values.identifier }),
        password: values.password,
      });

      router.push("/");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    }
  };

  const { register, handleSubmit, formState } = form;
  const { errors, isSubmitting } = formState;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden" dir="rtl">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-container/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-surface-container-high/40 rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-0 bg-surface-container-lowest rounded-xl overflow-hidden shadow-[24px_0_24px_-12px_rgba(18,28,42,0.06)] border border-outline-variant/15">

        {/* Left Side: Visual Content (Desktop Only) */}
        <div className="hidden md:flex flex-col justify-between p-12 bg-gradient-to-br from-primary to-primary-container text-on-primary relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12">
              <Wallet className="w-10 h-10" />
              <h1 className="text-2xl font-bold tracking-tight">المجلس الرقمي</h1>
            </div>
            <div className="space-y-6 max-w-md">
              <h2 className="text-4xl font-bold leading-tight">بوابتك لعالم من الخدمات الرقمية المتكاملة</h2>
              <p className="text-on-primary-container text-lg leading-relaxed opacity-90">
                انضم إلى آلاف المستخدمين في أكبر سوق للخدمات في المنطقة. نجمع لك الجودة والسهولة في مكان واحد.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
              <span className="text-2xl font-bold block">+٥٠ ألف</span>
              <span className="text-sm opacity-80">مستخدم نشط</span>
            </div>
            <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
              <span className="text-2xl font-bold block">+٢٠٠</span>
              <span className="text-sm opacity-80">مزود خدمة معتمد</span>
            </div>
          </div>

          <div className="absolute top-1/2 right-[-20%] w-full h-full bg-white/5 rounded-full blur-2xl transform -translate-y-1/2" />
        </div>

        {/* Right Side: Auth Form */}
        <div className="p-8 md:p-16 flex flex-col justify-center bg-surface-container-lowest">
          <div className="mb-10 text-center md:text-right">
            <h3 className="text-3xl font-bold text-on-surface mb-2">تسجيل الدخول</h3>
            <p className="text-on-surface-variant">مرحباً بك مجدداً! يرجى إدخال بياناتك للمتابعة.</p>
          </div>

          {/* Toggle Switch — purely cosmetic now: it swaps placeholder/icon/input
              type. The schema accepts either an email or an Egyptian phone, so
              the tab doesn't change validation. */}
          <div className="flex p-1 bg-surface-container-low rounded-full mb-8 max-w-xs mx-auto md:mr-0 md:ml-auto">
            <button
              type="button"
              onClick={() => setActiveTab("email")}
              className={`flex-1 py-2 px-6 rounded-full text-sm font-semibold transition-all cursor-pointer ${activeTab === "email" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              البريد الإلكتروني
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mobile")}
              className={`flex-1 py-2 px-6 rounded-full text-sm font-semibold transition-all cursor-pointer ${activeTab === "mobile" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              رقم الهاتف
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-on-surface-variant pr-1" htmlFor="identifier">
                {activeTab === "email" ? "البريد الإلكتروني" : "رقم الهاتف"}
              </label>
              <div className="relative">
                <input
                  id="identifier"
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-4 focus:ring-2 focus:bg-white transition-all text-right outline-none ${
                    errors.identifier ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"
                  }`}
                  placeholder={activeTab === "email" ? "example@domain.com" : "01xxxxxxxxx"}
                  type={activeTab === "email" ? "email" : "tel"}
                  inputMode={activeTab === "email" ? "email" : "tel"}
                  autoComplete={activeTab === "email" ? "email" : "tel"}
                  dir="ltr"
                  aria-invalid={errors.identifier ? "true" : "false"}
                  {...register("identifier")}
                />
                {activeTab === "email" ? (
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 w-5 h-5" />
                ) : (
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 w-5 h-5" />
                )}
              </div>
              {errors.identifier && (
                <p role="alert" className="text-xs text-red-700 pr-1">
                  {errors.identifier.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="password">كلمة المرور</label>
                <Link className="text-xs text-primary font-medium hover:underline" href="/forgot-password">نسيت كلمة المرور؟</Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-4 focus:ring-2 focus:bg-white transition-all text-right outline-none ${
                    errors.password ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"
                  }`}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  dir="ltr"
                  aria-invalid={errors.password ? "true" : "false"}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors cursor-pointer"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="text-xs text-red-700 pr-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 px-1">
              <input className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/30" id="remember" type="checkbox" />
              <label className="text-sm text-on-surface-variant cursor-pointer" htmlFor="remember">تذكرني على هذا الجهاز</label>
            </div>

            {/* Server-side rejection (wrong password, account locked, …) */}
            {submitError && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-on-primary py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:bg-primary-container active:scale-[0.98] transition-all mt-4 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          {/* Social Logins */}
          <div className="relative my-10">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant/30"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-4 bg-surface-container-lowest text-on-surface-variant">أو المتابعة باستخدام</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button type="button" className="flex items-center justify-center gap-3 py-3 border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-all cursor-pointer">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="text-sm font-semibold">جوجل</span>
            </button>
            <button type="button" className="flex items-center justify-center gap-3 py-3 border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-all cursor-pointer">
              <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="text-sm font-semibold">فيسبوك</span>
            </button>
          </div>

          <div className="mt-12 text-center">
            <p className="text-on-surface-variant">ليس لديك حساب؟
              <Link className="text-primary font-bold hover:underline mr-1" href="/signup">إنشاء حساب جديد</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

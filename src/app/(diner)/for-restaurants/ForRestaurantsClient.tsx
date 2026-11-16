"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  FileCheck2,
  ShieldCheck,
  Sparkles,
  Utensils,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";

export function ForRestaurantsClient({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  const [restaurantName, setRestaurantName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Dubai");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [existingQrProvider, setExistingQrProvider] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDemoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/public/request-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName,
          area,
          city,
          contactPerson,
          phone,
          existingQrProvider: existingQrProvider || undefined,
          notes: notes || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          data.error ||
            (isAr
              ? "تعذر إرسال الطلب حالياً. يرجى المحاولة لاحقاً."
              : "Could not submit request right now. Please try again."),
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError(isAr ? "حدث خطأ في الاتصال." : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-14">
      {/* Hero Section */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-12">
        <div className="max-w-3xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--accent-primary)] sm:text-sm">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>
              {isAr
                ? "مُصمم لمطاعم الإمارات • يعمل جنباً إلى جنب مع رمز الدفع الحالي"
                : "Built for UAE Restaurants • Works Alongside Your Existing Payment QR"}
            </span>
          </span>

          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl sm:leading-tight">
            {isAr
              ? "قائمة ذكية تُصفي مسببات الحساسية والميزانية قبل الطلب — وتقلل أخطاء المطبخ"
              : "Turn “Ask Our Team” Into Confident, Mistake-Free Table Orders"}
          </h1>

          <p className="text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {isAr
              ? "رموز الدفع على الطاولة (مثل Qlub وFoodics Pay وFineDine) تعالج الفاتورة بعد الأكل فقط. PlateFit يعمل قبل الطلب: يصفي الأطباق حسب الحساسية والنظام الغذائي والميزانية، ويرسل ملاحظات «بدون X» مباشرة إلى شاشة المطبخ."
              : "Checkout QR pucks (Qlub, Foodics Pay, FineDine) only settle the bill after dining. PlateFit sits alongside them before ordering—filtering dishes by allergies, diets, and budget, and sending accurate “without X” notes straight to your kitchen."}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="#request-demo"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
            >
              {isAr ? "اطلب عرضاً تجريبياً مجانياً" : "Request a Live Demo"}
            </a>

            <Link
              href="/r/demo-lebanese-kitchen/t/T1"
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
            >
              <span>{isAr ? "جرّب قائمة المطعم التجريبية الآن" : "Try Interactive Demo Menu"}</span>
              <ExternalLink className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            </Link>

            <Link
              href="/register?role=RESTAURANT_OWNER"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-[var(--accent-primary)] underline"
            >
              {isAr ? "تسجيل حساب مطعم مباشرة" : "Self-serve owner sign up"}
            </Link>
          </div>
        </div>
      </section>

      {/* 4 Value Pillars */}
      <section className="grid gap-6 sm:grid-cols-2">
        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {isAr
              ? "أسئلة حساسية أقل على الطاولة وأخطاء طلبات أقل"
              : "Fewer Allergy Questions & Fewer Kitchen Remakes"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {isAr
              ? "يرى الضيف فوراً الأطباق الموثقة الآمنة له أو التعديلات المطلوبة (مثل بدون صلصة لبن أو بخيار خالٍ من الغلوتين) قبل استدعاء النادل."
              : "Diners immediately see restaurant-verified safe dishes and required swaps (e.g. yogurt sauce on the side or lettuce wrap) instead of guessing or sending dishes back."}
          </p>
        </article>

        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <Utensils className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {isAr
              ? "طلبات «بدون مخلل / بدون بصل» تصل واضحة للمطبخ"
              : "Automatic “Without X” Kitchen Notes"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {isAr
              ? "تحدد أنت المكونات الإضافية القابلة للإزالة لكل طبق، وعندما لا يفضلها الضيف يُرسل الطلب تلقائياً بملاحظة واضحة للمطبخ دون إزعاج الطاقم."
              : "Mark which garnishes your kitchen can omit once; when a picky diner dislikes pickles or raw onion, PlateFit automatically attaches “No pickles” to the kitchen ticket."}
          </p>
        </article>

        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <CreditCard className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {isAr
              ? "يتكامل مع Qlub وFoodics Pay وFineDine بدون أي تعقيد"
              : "Works Alongside Qlub, Foodics Pay & FineDine"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {isAr
              ? "لا حاجة لتغيير نظام الكاشير أو بوابة الدفع لديك. بعد إرسال الطلب عبر PlateFit، نوجّه الضيف للدفع عبر رمز الدفع الموجود على طاولتك."
              : "Keep your POS and table checkout exactly as they are. After ordering through PlateFit, diners see “Pay with Qlub / Foodics Pay at your table” with your direct link."}
          </p>
        </article>

        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <FileCheck2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {isAr
              ? "جدول مسببات الحساسية القابل للطباعة بضغطة واحدة"
              : "One-Click Printable Allergen Matrix"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {isAr
              ? "يساعدك على إبقاء معلومات مسببات الحساسية موثقة ومتسقة عبر القوائم المطبوعة والرقمية، مع اسم المسؤول وتاريخ التوثيق."
              : "Helps you keep allergen information documented and consistent across print, QR, and delivery menus—complete with verifier name, date, and printable PDF layout."}
          </p>
        </article>
      </section>

      {/* Transparent Zero-Risk Pricing */}
      <section className="rounded-3xl border-2 border-[var(--accent-primary)]/40 bg-[var(--bg-surface)] p-6 sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              <span>{isAr ? "تسعير شفاف بدون اشتراك ثابت" : "Zero-Risk Usage Pricing"}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
              {isAr
                ? "الحد الأدنى بين 1.00 درهم أو 10% لكل طلب مقبول — وصفر درهم إذا لم يُستخدم"
                : "min(AED 1.00, 10%) per accepted app order — AED 0 if unused"}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {isAr
                ? "لا توجد رسوم تأسيس، ولا اشتراك شهري ثابت، ولا عمولات على الطلبات الملغاة أو التصفح فقط. سقف الرسوم درهم إماراتي واحد فقط مهما كبرت فاتورة الطاولة."
                : "No setup fees, no monthly SaaS lock-in, and zero charge for menu browsing or cancelled orders. Even on a AED 450 family table order, your fee is capped at just AED 1.00."}
            </p>
          </div>

          <div className="rounded-2xl bg-[var(--accent-soft)] px-6 py-5 text-center">
            <div className="font-mono text-3xl font-extrabold text-[var(--accent-primary)]">
              ≤ AED 1.00
            </div>
            <div className="mt-1 text-xs font-semibold text-[var(--text-primary)]">
              {isAr ? "الحد الأقصى لكل طلب عبر التطبيق" : "Maximum cap per accepted order"}
            </div>
          </div>
        </div>
      </section>

      {/* Request a Demo Form */}
      <section
        id="request-demo"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-10"
      >
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            <span>{isAr ? "احجز عرضاً عملياً في مطعمك" : "Book a 10-Minute Walkthrough"}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">
            {isAr ? "اطلب عرضاً تجريبياً لمطعمك" : "Request a Demo for Your Restaurant"}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {isAr
              ? "سنقوم بتجهيز عينة من قائمتك الفعلية بالعربية والإنجليزية لنعرضها لك على الطاولة."
              : "Tell us where you're located and we'll prepare a sample of your own menu in English & Arabic."}
          </p>
        </div>

        {submitted ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm font-medium text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-bold">
                {isAr
                  ? "شكراً لك! تم استلام طلب العرض التجريبي بنجاح."
                  : "Thank you! Your demo request has been recorded."}
              </p>
              <p className="mt-1 text-xs opacity-90">
                {isAr
                  ? "سيتواصل معك فريقنا قريباً لترتيب زيارة سريعة أو مكالمة."
                  : "Our team will reach out shortly to arrange a quick table demo."}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleDemoSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent-primary)] sm:col-span-2"
              >
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "اسم المطعم *" : "Restaurant name *"}
              </label>
              <input
                required
                minLength={2}
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder={isAr ? "مثال: مطعم بيت الأرز" : "e.g. Bait Al Arz"}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium">{isAr ? "المدينة *" : "City *"}</label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  {isAr ? "المنطقة / الحي *" : "Area / District *"}
                </label>
                <input
                  required
                  minLength={2}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder={isAr ? "مثل JLT أو جميرا" : "e.g. JLT, DIFC, Jumeirah"}
                  className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "اسم المسؤول *" : "Your name *"}
              </label>
              <input
                required
                minLength={2}
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder={isAr ? "الاسم الكامل" : "Owner or General Manager"}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "رقم الهاتف / واتساب *" : "Phone / WhatsApp *"}
              </label>
              <input
                required
                minLength={6}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 000 0000"
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "مزود QR الحالي (اختياري)" : "Existing table QR (optional)"}
              </label>
              <input
                value={existingQrProvider}
                onChange={(e) => setExistingQrProvider(e.target.value)}
                placeholder={
                  isAr
                    ? "مثل Qlub أو Foodics Pay أو لا يوجد"
                    : "Qlub, Foodics Pay, FineDine, or None"
                }
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "ملاحظات إضافية (اختياري)" : "Notes (optional)"}
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  isAr
                    ? "عدد الفروع أو أفضل وقت للتواصل"
                    : "Best time to visit or number of branches"
                }
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-bold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60 sm:w-auto"
              >
                {submitting
                  ? isAr
                    ? "جارٍ الإرسال..."
                    : "Submitting..."
                  : isAr
                    ? "إرسال طلب العرض التجريبي"
                    : "Submit Demo Request"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

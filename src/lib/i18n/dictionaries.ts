import { BRAND } from "@/config/brand";

export type Locale = "en" | "ar";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "ar";
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function pickLocalized(
  enValue: string | null | undefined,
  arValue: string | null | undefined,
  locale: Locale,
): string {
  if (locale === "ar") {
    return arValue?.trim() || enValue?.trim() || "";
  }
  return enValue?.trim() || arValue?.trim() || "";
}

export const DICTIONARY = {
  en: {
    brandName: BRAND.nameEn,
    tagline: BRAND.taglineEn,
    safetyDisclaimer: "Always confirm allergies with staff.",
    nav: {
      home: "Diner Home",
      restaurantDashboard: "Restaurant Portal",
      staffOrders: "Live Orders",
      adminPortal: "Admin",
      signIn: "Log in",
      signUp: "Sign up",
      signOut: "Sign out",
      switchToArabic: "العربية",
      switchToEnglish: "English",
      darkMode: "Toggle theme",
    },
    landing: {
      badge: "Made for UAE Dining • Prices in AED • EN & العربية",
      heroTitle: "Scan the table QR. See only the dishes made for you.",
      heroSubtitle:
        "Create your food profile once—allergies, intolerances, diet, favorite flavors, and meal budget. Every participating restaurant menu automatically filters unsafe dishes, highlights your top picks, and lets your whole table order together.",
      ctaGetStarted: "Create Free Diner Profile",
      ctaSignIn: "Log In",
      ctaRestaurantOwner: "For Restaurants — AED 0 upfront",
      howItWorksTitle: "How it works",
      step1Title: "1. Set your profile once",
      step1Body:
        "Select hard allergies/intolerances, diet (vegetarian, vegan, halal, keto), likes, and your meal budget in AED.",
      step2Title: "2. Scan at the table",
      step2Body:
        "Unsafe dishes are deterministically hidden unless a restaurant-verified modifier makes them safe for you.",
      step3Title: "3. Group up & order live",
      step3Body:
        "See mezze & platters everyone at your table can share, track your remaining budget, and send the order straight to the kitchen.",
      safetyBannerTitle: "Deterministic Allergy Safety",
      safetyBannerBody:
        "Allergies and intolerances are enforced by strict deterministic code—never AI guesses. Dishes only show as safe when explicitly verified by the restaurant.",
      pricingBannerTitle: "Fair UAE Restaurant Pricing",
      pricingBannerBody:
        "Restaurants pay AED 1.00 or 10% per accepted app order—whichever is less. Zero setup fees, zero monthly minimums.",
    },
    pwa: {
      installTitle: "Install app on your phone",
      installSubtitle: "Instant camera QR scanning & fast table menus—no app store needed.",
      installButton: "Install App",
      iosGuideButton: "How to install on iPhone",
      iosGuideSteps:
        "On iPhone Safari: tap the Share icon at the bottom of your screen, then tap 'Add to Home Screen'.",
      dismiss: "Not now",
    },
    auth: {
      loginTitle: "Welcome back",
      loginSubtitle: "Sign in to access your food profile or restaurant dashboard.",
      registerTitle: "Create your account",
      registerSubtitle: "Join as a diner or register your restaurant.",
      nameLabel: "Full name",
      emailLabel: "Email address",
      passwordLabel: "Password (min 8 characters)",
      accountTypeLabel: "Account type",
      roleDiner: "Diner — Personalize menus & order",
      roleOwner: "Restaurant Owner / Manager — Manage menus & tables",
      submitLogin: "Log in",
      submitRegister: "Create account",
      googleSignIn: "Continue with Google",
      noAccount: "New here?",
      haveAccount: "Already have an account?",
      invalidCredentials: "Invalid email or password.",
    },
    portals: {
      dinerWelcome: "Diner Home",
      dinerSubtitle:
        "Your personalized UAE dining hub—scan table QRs, plan group meals, and browse allergen-filtered menus.",
      restaurantWelcome: "Restaurant Dashboard",
      restaurantSubtitle:
        "Manage branches, AI Menu Builder, verified allergens, printable Allergen Matrix, QR tables, and live orders.",
      adminWelcome: "Platform Admin",
      adminSubtitle:
        "Manage the restaurant sales pipeline, approve partners, inspect the PlatformFee ledger, and issue monthly AED invoices.",
      roleBadge: "Signed in role",
    },
    offline: {
      title: "You are currently offline",
      body: "Please check your internet connection to load live restaurant menus and send table orders.",
      retry: "Try again",
    },
    ai: {
      notConfigured: "AI not configured",
    },
  },
  ar: {
    brandName: BRAND.nameAr,
    tagline: BRAND.taglineAr,
    safetyDisclaimer: "يرجى دائماً تأكيد الحساسية الغذائية مع طاقم المطعم.",
    nav: {
      home: "الرئيسية",
      restaurantDashboard: "لوحة المطعم",
      staffOrders: "الطلبات المباشرة",
      adminPortal: "الإدارة",
      signIn: "تسجيل الدخول",
      signUp: "إنشاء حساب",
      signOut: "تسجيل الخروج",
      switchToArabic: "العربية",
      switchToEnglish: "English",
      darkMode: "تبديل المظهر",
    },
    landing: {
      badge: "مصمم لمطاعم الإمارات • الأسعار بالدرهم الإماراتي • العربية والإنجليزية",
      heroTitle: "امسح رمز الطاولة. شاهد الأطباق المناسبة لك فقط.",
      heroSubtitle:
        "أنشئ ملفك الغذائي مرة واحدة — الحساسية، عدم التحمل الغذائي، النظام الغذائي، النكهات المفضلة وميزانية الوجبة. يتم تصفية الأطباق غير الآمنة تلقائياً وترتيب أفضل الخيارات لك ولمجموعتك على الطاولة.",
      ctaGetStarted: "أنشئ ملفك الغذائي مجاناً",
      ctaSignIn: "تسجيل الدخول",
      ctaRestaurantOwner: "للمطاعم — 0 درهم رسوم تأسيس",
      howItWorksTitle: "كيف يعمل التطبيق",
      step1Title: "١. أنشئ ملفك مرة واحدة",
      step1Body:
        "حدد الحساسية الغذائية، النظام الغذائي (نباتي، حلال، كيتو)، المكونات المفضلة وميزانية وجبتك بالدرهم.",
      step2Title: "٢. امسح رمز QR على الطاولة",
      step2Body:
        "يتم إخفاء الأطباق غير المناسبة برمجياً بدقة تامة إلا إذا توفرت إضافة معتمدة من المطعم تجعلها آمنة.",
      step3Title: "٣. اطلب مع أصدقائك مباشرة",
      step3Body:
        "اكتشف أطباق المشاركة المناسبة للجميع على الطاولة، وتابع ميزانيتك المتبقية، وأرسل الطلب مباشرة للمطبخ.",
      safetyBannerTitle: "أمان صارم للحساسية الغذائية",
      safetyBannerBody:
        "تتم تصفية الحساسية وعدم التحمل الغذائي عبر قواعد برمجية حتمية وليست تخمينات ذكاء اصطناعي. لا يظهر الطبق كآمن إلا بعد توثيقه من المطعم.",
      pricingBannerTitle: "تسعير عادل للمطاعم في الإمارات",
      pricingBannerBody:
        "يدفع المطعم ١.٠٠ درهم أو ١٠٪ من قيمة الطلب المقبول عبر التطبيق — أيهما أقل. بدون اشتراك شهري ثابت.",
    },
    pwa: {
      installTitle: "ثبّت التطبيق على هاتفك",
      installSubtitle: "مسح سريع لرمز الطاولة وتصفح فوري للقوائم بدون متجر تطبيقات.",
      installButton: "تثبيت التطبيق",
      iosGuideButton: "طريقة التثبيت على آيفون",
      iosGuideSteps:
        "في متصفح سفاري على آيفون: اضغط على أيقونة المشاركة في أسفل الشاشة ثم اختر «إضافة إلى الشاشة الرئيسية».",
      dismiss: "ليس الآن",
    },
    auth: {
      loginTitle: "مرحباً بعودتك",
      loginSubtitle: "سجّل الدخول للوصول إلى ملفك الغذائي أو لوحة تحكم مطعمك.",
      registerTitle: "إنشاء حساب جديد",
      registerSubtitle: "انضم كضيف في المطاعم أو سجّل مطعمك معنا.",
      nameLabel: "الاسم الكامل",
      emailLabel: "البريد الإلكتروني",
      passwordLabel: "كلمة المرور (٨ أحرف على الأقل)",
      accountTypeLabel: "نوع الحساب",
      roleDiner: "ضيف / زبون — قوائم مخصصة وطلب من الطاولة",
      roleOwner: "صاحب / مدير مطعم — إدارة القوائم والطاولات",
      submitLogin: "تسجيل الدخول",
      submitRegister: "إنشاء الحساب",
      googleSignIn: "المتابعة باستخدام Google",
      noAccount: "ليس لديك حساب؟",
      haveAccount: "لديك حساب بالفعل؟",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    },
    portals: {
      dinerWelcome: "صفحة الضيف الرئيسية",
      dinerSubtitle:
        "مركزك الشخصي لتجربة الطعام في الإمارات — امسح رموز الطاولات، خطط وجباتك مع أصدقائك، وتصفح القوائم الآمنة لك.",
      restaurantWelcome: "لوحة تحكم المطعم",
      restaurantSubtitle:
        "إدارة الفروع، منشئ القوائم بالذكاء الاصطناعي، توثيق مسببات الحساسية، رموز QR والطلبات المباشرة.",
      adminWelcome: "لوحة إدارة المنصة",
      adminSubtitle:
        "إدارة خط مبيعات المطاعم، اعتماد الشركاء، سجل رسوم المنصة، الفواتير الشهرية بالدرهم، وسجل الذكاء الاصطناعي.",
      roleBadge: "الصلاحية الحالية",
    },
    offline: {
      title: "أنت غير متصل بالإنترنت حالياً",
      body: "يرجى التحقق من اتصالك بالإنترنت لتحميل قوائم المطاعم المحدثة وإرسال طلبات الطاولة.",
      retry: "إعادة المحاولة",
    },
    ai: {
      notConfigured: "الذكاء الاصطناعي غير مُعدّ",
    },
  },
} as const;

export type Dictionary = (typeof DICTIONARY)[Locale];

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARY[locale];
}

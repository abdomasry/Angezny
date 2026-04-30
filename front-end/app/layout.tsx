import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ChatProvider } from "@/lib/chat-context";
import ChatWidget from "@/components/ChatWidget";
import QueryProvider from "@/components/QueryProvider";
import { isRtl, type Locale } from "@/i18n/request";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DK yet",
  description: "منصتكم الأولى لخدمات الصيانة والمنزل المتكاملة",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side locale + messages (resolved by i18n/request.ts from the
  // NEXT_LOCALE cookie, defaulting to ar). We pass them into the client
  // provider so every "use client" page can call useTranslations().
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  const rtl = isRtl(locale);

  return (
    <html
      lang={locale}
      dir={rtl ? "rtl" : "ltr"}
      className={`${ibmPlexArabic.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            {/* QueryProvider sits inside AuthProvider so query functions can
                read the auth token freshly on each fetch (api.getWithAuth
                already pulls from localStorage), and outside ChatProvider so
                chat-seed fetches can later move into useQuery if we want. */}
            <QueryProvider>
              <ChatProvider>
                {children}
                {/* Floating chat bubble — renders only when the user is logged in.
                    Globally mounted so it's available on every page. */}
                <ChatWidget />
              </ChatProvider>
            </QueryProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

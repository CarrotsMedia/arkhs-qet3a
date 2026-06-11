import { Cairo } from "next/font/google";
import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";

const cairo = Cairo({ subsets: ["arabic", "latin"] });

export const metadata = {
  title: "أرخصلي | قارن أسعار الموبايلات والأجهزة الإلكترونية في مصر",
  description: "موقع أرخصلي لمقارنة الأسعار يساعدك على العثور على أرخص أسعار الموبايلات، اللابتوب، والأجهزة الإلكترونية من مختلف المتاجر في مصر.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased" suppressHydrationWarning>
      <body className={`${cairo.className} min-h-full flex flex-col bg-gray-50`}>
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

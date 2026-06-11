"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Heart, Menu, X, Smartphone, Laptop, ChevronDown } from "lucide-react";

const NAV_CATEGORIES = [
  { label: "الموبايلات", slug: "mobiles", icon: Smartphone, color: "emerald" },
  { label: "الإلكترونيات", slug: "electronics", icon: Laptop, color: "blue" },
];

export default function Header() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/products?q=${encodeURIComponent(query.trim())}`);
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 glass border-b border-gray-200/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-blue-600 flex items-center justify-center shadow-md shadow-emerald-200/50 group-hover:shadow-lg group-hover:shadow-emerald-200/70 group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-extrabold text-base">أ</span>
            </div>
            <span className="font-extrabold text-gray-900 text-xl tracking-tight hidden sm:block group-hover:text-emerald-600 transition-colors duration-200">
              أرخصلي
            </span>
          </Link>

          {/* Category Nav - Desktop */}
          <nav className="hidden md:flex items-center gap-1 mr-2">
            {NAV_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.slug}
                  href={`/products?category=${cat.slug}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-600 rounded-lg hover:bg-${cat.color}-50 hover:text-${cat.color}-700 transition-all duration-200`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </Link>
              );
            })}
          </nav>

          {/* Search - Desktop */}
          <div className="flex-1 max-w-xl hidden md:block">
            <form onSubmit={handleSearch} className="relative group">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-emerald-600 transition-colors" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن موبايل، لابتوب، أو أي جهاز..."
                className="w-full bg-gray-50/80 border border-gray-200 rounded-xl pr-10 pl-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-300 hover:border-gray-300 transition-all duration-200"
              />
            </form>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 mr-auto md:mr-0">
            <Link 
              href="/products"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-600 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
            >
              كل المنتجات
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200/60 bg-white/95 backdrop-blur-sm animate-slide-down">
          <div className="px-4 py-4 space-y-3">
            {/* Mobile Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن منتج..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pr-10 pl-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 transition-all"
              />
            </form>

            {/* Mobile Nav Links */}
            <div className="space-y-1">
              {NAV_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Link
                    key={cat.slug}
                    href={`/products?category=${cat.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-600" />
                    </div>
                    {cat.label}
                  </Link>
                );
              })}
              <Link
                href="/products"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 text-sm font-semibold text-emerald-700 rounded-xl hover:bg-emerald-50 transition-colors"
              >
                كل المنتجات
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

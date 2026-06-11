import { Sparkles } from "lucide-react";

function ProductCardSkeleton() {
  return (
    <div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      {/* Image Skeleton */}
      <div className="relative aspect-square bg-gray-100 border-b border-gray-200" />
      {/* Content Skeleton */}
      <div className="flex-1 flex flex-col p-4 gap-3">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-12 bg-gray-200 rounded-full" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="mt-auto pt-2 border-t border-gray-200 flex justify-between items-center">
          <div className="space-y-1 w-2/3">
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-6 bg-gray-200 rounded w-full" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-8" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans" dir="rtl">
      {/* Hero Section with Search Skeleton */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/50 via-blue-50/30 to-white py-16 md:py-24 border-b border-gray-100">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_50rem_at_top,theme(colors.emerald.50),theme(colors.blue.50/20))] opacity-60" />
        
        <div className="container mx-auto px-4 text-center max-w-4xl">
          {/* Badge Skeleton */}
          <div className="inline-flex items-center gap-1.5 bg-emerald-100/80 border border-emerald-200 rounded-full px-3.5 py-1.5 text-xs font-bold text-emerald-800 mb-6 animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            منصة مقارنة الأسعار الأذكى في مصر
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-gray-900 mb-6 leading-tight tracking-tight">
            قارن الأسعار واشتري <span className="text-transparent bg-clip-text bg-gradient-to-l from-emerald-600 to-blue-600">بأرخص سعر!</span>
          </h1>
          
          <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-2xl mx-auto font-medium">
            تطبيق <span className="font-extrabold text-emerald-600">أرخصلي</span> يقارن لك أسعار الموبايلات والأجهزة الإلكترونية في مختلف المتاجر لحظة بلحظة ليضمن لك الشراء بأفضل عرض.
          </p>

          {/* Search form skeleton */}
          <div className="max-w-2xl mx-auto mb-6 h-14 bg-white border border-gray-200 rounded-2xl animate-pulse" />
        </div>
      </section>

      {/* Categories Skeleton */}
      <section className="py-8 bg-white border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto pb-4 gap-3" style={{ scrollbarWidth: 'none' }}>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-10 w-28 bg-gray-100 rounded-full flex-shrink-0 animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Deals Skeleton */}
      <section className="py-12 container mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Featured Products Skeleton */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

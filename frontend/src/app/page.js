import ProductCard from "../components/ProductCard";
import Link from "next/link";
import { Smartphone, Laptop, Search, Sparkles, Flame, Star, ShieldCheck, TrendingDown, Store, BarChart3 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function getDeals() {
  try {
    const res = await fetch(`${API_URL}/api/deals`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function getFeaturedProducts() {
  try {
    const res = await fetch(`${API_URL}/api/featured`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function getStats() {
  try {
    const res = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    return null;
  }
}

export default async function HomePage() {
  const [deals, featuredProducts, stats] = await Promise.all([
    getDeals(),
    getFeaturedProducts(),
    getStats()
  ]);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans" dir="rtl">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/60 via-blue-50/30 to-white py-16 md:py-24 border-b border-gray-100">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_50rem_at_top,theme(colors.emerald.50),theme(colors.blue.50/20))] opacity-60" />
        
        {/* Subtle animated background shapes */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-10 left-10 w-56 h-56 bg-blue-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        
        <div className="container mx-auto px-4 text-center max-w-4xl relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-white/80 backdrop-blur-sm border border-emerald-200/60 rounded-full px-4 py-2 text-xs font-bold text-emerald-800 mb-8 shadow-sm animate-slide-down">
            <Sparkles className="w-3.5 h-3.5" />
            منصة مقارنة الأسعار الأذكى في مصر
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-gray-900 mb-6 leading-tight tracking-tight animate-slide-up">
            قارن الأسعار واشتري{" "}
            <span className="gradient-text">بأرخص سعر!</span>
          </h1>
          
          <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-2xl mx-auto font-medium animate-slide-up stagger-2 opacity-0">
            تطبيق <span className="font-extrabold text-emerald-600">أرخصلي</span> يقارن لك أسعار الموبايلات والأجهزة الإلكترونية في مختلف المتاجر لحظة بلحظة ليضمن لك الشراء بأفضل عرض.
          </p>

          {/* Search form */}
          <div className="max-w-2xl mx-auto mb-8 animate-slide-up stagger-3 opacity-0">
            <form action="/products" method="GET" className="relative group">
              <Search className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-emerald-600 transition-colors" />
              <input
                type="text"
                name="q"
                placeholder="ابحث عن موبايل، لابتوب، آيباد، كارت شاشة..."
                className="w-full bg-white border border-gray-200 rounded-2xl pr-14 pl-36 py-4.5 text-base text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-300 shadow-xl shadow-gray-100/80 hover:border-gray-300 hover:shadow-2xl transition-all duration-300"
              />
              <button
                type="submit"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white font-bold px-7 py-2.5 rounded-xl text-sm transition-all duration-300 shadow-lg shadow-emerald-200/50 hover:shadow-xl hover:shadow-emerald-300/50 active:scale-95"
              >
                ابحث الآن
              </button>
            </form>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="flex items-center justify-center gap-6 md:gap-10 animate-fade-in stagger-4 opacity-0">
              {stats.totalProducts && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-gray-900 text-lg leading-tight">{stats.totalProducts?.toLocaleString() || '0'}</div>
                    <div className="text-xs text-gray-400 font-medium">منتج</div>
                  </div>
                </div>
              )}
              {stats.totalStores && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Store className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-gray-900 text-lg leading-tight">{stats.totalStores?.toLocaleString() || '0'}</div>
                    <div className="text-xs text-gray-400 font-medium">متجر</div>
                  </div>
                </div>
              )}
              {stats.totalOffers && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <TrendingDown className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-gray-900 text-lg leading-tight">{stats.totalOffers?.toLocaleString() || '0'}</div>
                    <div className="text-xs text-gray-400 font-medium">عرض سعر</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main Categories */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 text-center">
            تصفح حسب الفئة
          </h2>
          <p className="text-gray-500 text-sm md:text-base mb-12 text-center max-w-md mx-auto">
            اختر أحد الأقسام الأساسية لمقارنة المنتجات والأسعار
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category 1: Mobiles */}
            <div className="group relative overflow-hidden bg-gradient-to-b from-emerald-50/80 to-white border border-emerald-100 hover:border-emerald-300 rounded-3xl p-8 card-hover flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-200/50 group-hover:scale-110 transition-transform duration-300">
                  <Smartphone className="w-7 h-7" />
                </div>
                
                <h3 className="text-2xl font-extrabold text-gray-900 mb-3 group-hover:text-emerald-700 transition-colors">
                  الموبايلات والهواتف
                </h3>
                
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  تصفح وقارن أسعار أحدث الهواتف الذكية والأجهزة اللوحية والساعات الذكية والإكسسوارات من مختلف العلامات التجارية مثل آبل وسامسونج وشاومي.
                </p>

                <div className="flex flex-wrap gap-2 mb-8">
                  {["هواتف ذكية", "أجهزة لوحية (تابلت)", "ساعات ذكية", "إكسسوارات"].map((sub, i) => (
                    <span key={i} className="bg-white border border-emerald-100 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                      {sub}
                    </span>
                  ))}
                </div>
              </div>

              <Link
                href="/products?category=mobiles"
                className="inline-flex items-center justify-center bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold px-6 py-3.5 rounded-xl transition-all duration-300 shadow-md shadow-emerald-200/50 hover:shadow-lg active:scale-[0.98]"
              >
                تصفح قسم الموبايلات
              </Link>
            </div>

            {/* Category 2: Electronics */}
            <div className="group relative overflow-hidden bg-gradient-to-b from-blue-50/80 to-white border border-blue-100 hover:border-blue-300 rounded-3xl p-8 card-hover flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-200/50 group-hover:scale-110 transition-transform duration-300">
                  <Laptop className="w-7 h-7" />
                </div>
                
                <h3 className="text-2xl font-extrabold text-gray-900 mb-3 group-hover:text-blue-700 transition-colors">
                  الأجهزة الإلكترونية
                </h3>
                
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  مقارنة أسعار أجهزة اللابتوب، قطع الكمبيوتر المكتبي، شاشات العرض، التلفزيونات الذكية، ملحقات الألعاب، الكاميرات وأجهزة الميكروفون.
                </p>

                <div className="flex flex-wrap gap-2 mb-8">
                  {["أجهزة لابتوب", "شاشات وتلفزيونات", "قطع هاردوير", "كيبورد وماوس", "سماعات"].map((sub, i) => (
                    <span key={i} className="bg-white border border-blue-100 text-blue-800 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                      {sub}
                    </span>
                  ))}
                </div>
              </div>

              <Link
                href="/products?category=electronics"
                className="inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold px-6 py-3.5 rounded-xl transition-all duration-300 shadow-md shadow-blue-200/50 hover:shadow-lg active:scale-[0.98]"
              >
                تصفح قسم الإلكترونيات
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Deals Section */}
      {deals.length > 0 && (
        <section className="py-16 bg-gray-50/50 border-t border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10 max-w-6xl mx-auto">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2.5">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <Flame className="w-5 h-5 text-red-500 fill-red-500" />
                </div>
                أقوى العروض الحالية
              </h2>
              <Link href="/products" className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold text-sm transition-colors">
                عرض الكل ←
              </Link>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-6xl mx-auto">
              {deals.slice(0, 10).map((product, idx) => (
                <ProductCard key={product.id || product.product_id} product={product} index={idx} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Section */}
      {featuredProducts.length > 0 && (
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10 max-w-6xl mx-auto">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2.5">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                </div>
                منتجات مميزة
              </h2>
              <Link href="/products" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold text-sm transition-colors">
                عرض الكل ←
              </Link>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-6xl mx-auto">
              {featuredProducts.slice(0, 10).map((product, idx) => (
                <ProductCard key={product.id || product.product_id} product={product} index={idx} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust Section */}
      <section className="py-12 bg-gray-50/50 border-t border-gray-100">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center gap-3 p-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-sm">أسعار محدثة يومياً</h3>
              <p className="text-xs text-gray-500 leading-relaxed">نقوم بتحديث الأسعار من جميع المتاجر بشكل مستمر</p>
            </div>
            <div className="flex flex-col items-center gap-3 p-6">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                <Store className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-sm">متاجر موثوقة</h3>
              <p className="text-xs text-gray-500 leading-relaxed">نقارن بين أفضل المتاجر المعتمدة في مصر فقط</p>
            </div>
            <div className="flex flex-col items-center gap-3 p-6">
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-sm">أفضل العروض</h3>
              <p className="text-xs text-gray-500 leading-relaxed">نرصد لك أقوى التخفيضات وأفضل الأسعار تلقائياً</p>
            </div>
          </div>
        </div>
      </section>
      
    </div>
  );
}

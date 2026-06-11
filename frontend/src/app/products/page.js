import ProductCard from "../../components/ProductCard";
import Pagination from "../../components/Pagination";
import Breadcrumbs from "../../components/Breadcrumbs";
import Link from "next/link";
import { SlidersHorizontal, ArrowUpDown, Package, Smartphone, Laptop } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const PRODUCTS_PER_PAGE = 40;

async function getCategoryDetail(slug) {
  try {
    const res = await fetch(`${API_URL}/api/categories/${encodeURIComponent(slug)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function getProductsByCategory(category, page = 1, limit = PRODUCTS_PER_PAGE, sort = 'smart_rank') {
  try {
    const res = await fetch(
      `${API_URL}/api/categories/${encodeURIComponent(category)}/products?page=${page}&limit=${limit}&sort=${sort}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return { products: [], total: 0, page: 1, totalPages: 1 };
    return res.json();
  } catch (err) {
    console.error(err);
    return { products: [], total: 0, page: 1, totalPages: 1 };
  }
}

async function searchProducts(query, page = 1, limit = PRODUCTS_PER_PAGE, sort = 'smart_rank') {
  try {
    const res = await fetch(
      `${API_URL}/api/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}&sort=${sort}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return { products: [], total: 0, page: 1, totalPages: 1 };
    return res.json();
  } catch (err) {
    console.error(err);
    return { products: [], total: 0, page: 1, totalPages: 1 };
  }
}

async function getAllProducts(page = 1, limit = PRODUCTS_PER_PAGE) {
  try {
    const res = await fetch(
      `${API_URL}/api/deals?limit=${limit}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    return [];
  }
}

export async function generateMetadata({ searchParams }) {
  const { category, q } = await searchParams;
  let title = 'جميع المنتجات';
  if (q) {
    title = `نتائج البحث عن "${q}"`;
  } else if (category) {
    const categoryData = await getCategoryDetail(category);
    title = categoryData ? `منتجات قسم ${categoryData.name_ar || categoryData.name}` : `منتجات قسم ${category}`;
  }
  return {
    title: `${title} | أرخصلي`,
    description: `تصفح أفضل ${title} وقارن الأسعار من مختلف المتاجر في مصر.`,
  };
}

const SORT_OPTIONS = [
  { value: 'smart_rank', label: 'الأكثر ملاءمة' },
  { value: 'price_asc', label: 'السعر: من الأقل' },
  { value: 'price_desc', label: 'السعر: من الأعلى' },
  { value: 'newest', label: 'الأحدث' },
];

const CATEGORY_INFO = {
  mobiles: { label: 'الموبايلات والهواتف', icon: Smartphone, color: 'emerald' },
  electronics: { label: 'الأجهزة الإلكترونية', icon: Laptop, color: 'blue' },
};

export default async function ProductsPage({ searchParams }) {
  const { category, q, page: pageParam, sort: sortParam } = await searchParams;
  
  const currentPage = parseInt(pageParam) || 1;
  const currentSort = sortParam || 'smart_rank';
  
  let products = [];
  let totalProducts = 0;
  let totalPages = 1;
  let titleText = '';
  let breadcrumbs = [];
  
  if (q) {
    const searchData = await searchProducts(q, currentPage, PRODUCTS_PER_PAGE, currentSort);
    products = searchData?.products || [];
    totalProducts = searchData?.total || products.length;
    totalPages = searchData?.totalPages || Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    titleText = `نتائج البحث عن: "${q}"`;
    breadcrumbs = [{ label: 'بحث', href: '/products' }, { label: q }];
  } else if (category) {
    const [productsData, categoryData] = await Promise.all([
      getProductsByCategory(category, currentPage, PRODUCTS_PER_PAGE, currentSort),
      getCategoryDetail(category)
    ]);
    products = productsData?.products || [];
    totalProducts = productsData?.total || products.length;
    totalPages = productsData?.totalPages || Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const catName = categoryData ? (categoryData.name_ar || categoryData.name) : category;
    titleText = catName;
    breadcrumbs = [{ label: catName }];
  } else {
    titleText = 'كل المنتجات';
    const allProducts = await getAllProducts(currentPage, PRODUCTS_PER_PAGE);
    products = Array.isArray(allProducts) ? allProducts : (allProducts?.products || []);
    totalProducts = allProducts?.total || products.length;
    totalPages = allProducts?.totalPages || 1;
    breadcrumbs = [{ label: 'كل المنتجات' }];
  }

  // Build query params for pagination links
  const queryParams = {};
  if (q) queryParams.q = q;
  if (category) queryParams.category = category;
  if (currentSort !== 'smart_rank') queryParams.sort = currentSort;

  const catInfo = category ? CATEGORY_INFO[category] : null;
  const CatIcon = catInfo?.icon || Package;

  return (
    <div className="min-h-screen bg-gray-50/50 pb-16 font-sans" dir="rtl">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumbs items={breadcrumbs} />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${catInfo ? (catInfo.color === 'emerald' ? 'from-emerald-500 to-emerald-700' : 'from-blue-500 to-blue-700') : 'from-gray-600 to-gray-800'} flex items-center justify-center text-white shadow-lg ${catInfo ? (catInfo.color === 'emerald' ? 'shadow-emerald-200/50' : 'shadow-blue-200/50') : 'shadow-gray-200/50'}`}>
                <CatIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
                  {titleText}
                </h1>
                <p className="text-sm text-gray-500 font-medium mt-0.5">
                  {totalProducts > 0 ? `${totalProducts.toLocaleString()} منتج متاح` : 'لا توجد نتائج'}
                </p>
              </div>
            </div>

            {/* Sort & Filter Controls */}
            <div className="flex items-center gap-2">
              {/* Sort dropdown */}
              <div className="relative">
                <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-700">
                  <ArrowUpDown className="w-4 h-4 text-gray-400" />
                  <span className="hidden sm:inline">ترتيب:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {SORT_OPTIONS.map((opt) => (
                      <Link
                        key={opt.value}
                        href={`/products?${new URLSearchParams({ ...queryParams, sort: opt.value, page: '1' }).toString()}`}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          currentSort === opt.value
                            ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        }`}
                      >
                        {opt.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Category Quick Nav */}
          {!q && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              <Link
                href="/products"
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${
                  !category 
                    ? 'bg-gray-900 text-white shadow-md' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                الكل
              </Link>
              {Object.entries(CATEGORY_INFO).map(([slug, info]) => {
                const Icon = info.icon;
                const isActive = category === slug;
                return (
                  <Link
                    key={slug}
                    href={`/products?category=${slug}`}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${
                      isActive
                        ? `bg-${info.color}-600 text-white shadow-md shadow-${info.color}-200/50`
                        : `bg-white border border-gray-200 text-gray-600 hover:bg-${info.color}-50 hover:border-${info.color}-200 hover:text-${info.color}-700`
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {info.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((product, idx) => (
                <ProductCard key={product.id || product.product_id} product={product} index={idx} />
              ))}
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalProducts}
              basePath="/products"
              queryParams={queryParams}
            />
          </>
        ) : (
          <div className="text-center py-24 animate-fade-in">
            <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-200 shadow-sm p-10">
              <div className="w-20 h-20 mx-auto mb-6 bg-gray-50 rounded-2xl flex items-center justify-center">
                <Package className="w-10 h-10 text-gray-300" />
              </div>
              <h2 className="text-xl font-extrabold text-gray-800 mb-2">لا توجد منتجات مطابقة</h2>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                جرّب استخدام كلمات بحث أخرى أو تصفح الأقسام الرئيسية.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-2 justify-center">
                <Link 
                  href="/products?category=mobiles"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm shadow-sm"
                >
                  <Smartphone className="w-4 h-4" />
                  تصفح الموبايلات
                </Link>
                <Link 
                  href="/products?category=electronics"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm shadow-sm"
                >
                  <Laptop className="w-4 h-4" />
                  تصفح الإلكترونيات
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

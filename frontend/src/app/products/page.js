import ProductCard from "../../components/ProductCard";
import Pagination from "../../components/Pagination";
import Breadcrumbs from "../../components/Breadcrumbs";
import FilterSidebar from "../../components/FilterSidebar";
import Link from "next/link";
import { ArrowUpDown, Package, Smartphone, Laptop, X } from "lucide-react";

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

async function getProductsAndFacets(slug, isSubcategory = false, queryParams = {}) {
  try {
    const urlParams = new URLSearchParams();
    
    // Set standard parameters
    if (queryParams.page) urlParams.set('page', queryParams.page);
    if (queryParams.limit) urlParams.set('limit', queryParams.limit);
    if (queryParams.sort) urlParams.set('sort', queryParams.sort);
    if (queryParams.brand) urlParams.set('brand', queryParams.brand);
    if (queryParams.min_price) urlParams.set('min_price', queryParams.min_price);
    if (queryParams.max_price) urlParams.set('max_price', queryParams.max_price);
    if (queryParams.in_stock) urlParams.set('in_stock', queryParams.in_stock);
    if (queryParams.min_stores) urlParams.set('min_stores', queryParams.min_stores);
    
    // Add all dynamic attribute filters
    const systemParams = ['category', 'subcategory', 'q', 'page', 'limit', 'sort', 'brand', 'min_price', 'max_price', 'in_stock', 'min_stores'];
    Object.entries(queryParams).forEach(([key, val]) => {
      if (!systemParams.includes(key) && val !== undefined && val !== null && val !== '') {
        urlParams.set(key, val);
      }
    });

    const endpoint = isSubcategory 
      ? `${API_URL}/api/subcategories/${encodeURIComponent(slug)}/products`
      : `${API_URL}/api/categories/${encodeURIComponent(slug)}/products`;

    const res = await fetch(`${endpoint}?${urlParams.toString()}`, { next: { revalidate: 60 } });
    if (!res.ok) {
      return { products: [], total: 0, page: 1, totalPages: 1, facets: null };
    }
    return res.json();
  } catch (err) {
    console.error('getProductsAndFacets error:', err);
    return { products: [], total: 0, page: 1, totalPages: 1, facets: null };
  }
}

async function searchProducts(query, queryParams = {}) {
  try {
    const urlParams = new URLSearchParams();
    urlParams.set('q', query);
    if (queryParams.page) urlParams.set('page', queryParams.page);
    if (queryParams.limit) urlParams.set('limit', queryParams.limit);
    if (queryParams.sort) urlParams.set('sort', queryParams.sort);
    if (queryParams.brand) urlParams.set('brand', queryParams.brand);
    if (queryParams.min_price) urlParams.set('min_price', queryParams.min_price);
    if (queryParams.max_price) urlParams.set('max_price', queryParams.max_price);
    if (queryParams.in_stock) urlParams.set('in_stock', queryParams.in_stock);
    if (queryParams.min_stores) urlParams.set('min_stores', queryParams.min_stores);

    // Add all dynamic attribute filters
    const systemParams = ['category', 'subcategory', 'q', 'page', 'limit', 'sort', 'brand', 'min_price', 'max_price', 'in_stock', 'min_stores'];
    Object.entries(queryParams).forEach(([key, val]) => {
      if (!systemParams.includes(key) && val !== undefined && val !== null && val !== '') {
        urlParams.set(key, val);
      }
    });

    const res = await fetch(`${API_URL}/api/search?${urlParams.toString()}`, { next: { revalidate: 60 } });
    if (!res.ok) return { products: [], total: 0, page: 1, totalPages: 1 };
    return res.json();
  } catch (err) {
    console.error('searchProducts error:', err);
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
  const resolvedParams = await searchParams;
  const { category, subcategory, q } = resolvedParams;
  let title = 'جميع المنتجات';
  let description = 'تصفح وقارن أسعار المنتجات في مصر.';
  
  if (q) {
    title = `نتائج البحث عن "${q}"`;
    description = `نتائج البحث عن "${q}" وقارن الأسعار من مختلف المتاجر في مصر.`;
  } else if (subcategory) {
    try {
      const res = await fetch(`${API_URL}/api/subcategories/${encodeURIComponent(subcategory)}/products?limit=1`);
      if (res.ok) {
        const data = await res.json();
        const subcatName = data?.subcategory?.name;
        if (subcatName) {
          title = `منتجات قسم ${subcatName}`;
          description = `تصفح أفضل أسعار منتجات قسم ${subcatName} وقارن العروض من مختلف المتاجر.`;
        }
      }
    } catch (err) {
      console.error(err);
    }
  } else if (category) {
    const categoryData = await getCategoryDetail(category);
    const catName = categoryData ? (categoryData.name_ar || categoryData.name) : category;
    title = `منتجات قسم ${catName}`;
    description = categoryData?.seo_description || `تصفح أفضل أسعار منتجات قسم ${catName} وقارن العروض من مختلف المتاجر.`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arkhsly.com';
  let canonicalUrl = `${siteUrl}/products`;
  if (category) {
    canonicalUrl += `?category=${category}`;
    if (subcategory) {
      canonicalUrl += `&subcategory=${subcategory}`;
    }
  } else if (q) {
    canonicalUrl += `?q=${encodeURIComponent(q)}`;
  }

  return {
    title: `${title} | أرخصلي`,
    description,
    alternates: {
      canonical: canonicalUrl,
    }
  };
}

const SORT_OPTIONS = [
  { value: 'smart_rank', label: 'الأكثر ملاءمة' },
  { value: 'price_asc', label: 'السعر: من الأقل' },
  { value: 'price_desc', label: 'السعر: من الأعلى' },
  { value: 'newest', label: 'الأحدث' },
];

const CATEGORY_INFO = {
  mobiles: { 
    label: 'الموبايلات والهواتف', 
    icon: Smartphone, 
    activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-200/50', 
    inactiveClass: 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700',
    headerBg: 'from-emerald-500 to-emerald-700 shadow-emerald-200/50'
  },
  electronics: { 
    label: 'الأجهزة الإلكترونية', 
    icon: Laptop, 
    activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-200/50', 
    inactiveClass: 'bg-white border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700',
    headerBg: 'from-blue-500 to-blue-700 shadow-blue-200/50'
  },
};

export default async function ProductsPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const { category, subcategory, q, page: pageParam, sort: sortParam } = resolvedParams;
  
  const currentPage = parseInt(pageParam) || 1;
  const currentSort = sortParam || 'smart_rank';
  
  // Collect all active filters for search/API query
  const queryParams = {};
  Object.entries(resolvedParams).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      queryParams[key] = val;
    }
  });

  let products = [];
  let totalProducts = 0;
  let totalPages = 1;
  let titleText = '';
  let breadcrumbs = [];
  let facets = null;
  let activeCategory = null;
  let activeSubcategory = null;
  
  if (q) {
    const searchData = await searchProducts(q, queryParams);
    products = searchData?.products || [];
    totalProducts = searchData?.total || products.length;
    totalPages = searchData?.totalPages || Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    titleText = `نتائج البحث عن: "${q}"`;
    breadcrumbs = [{ label: 'بحث', href: '/products' }, { label: q }];
    facets = searchData?.facets || null;
  } else if (subcategory) {
    const subcatData = await getProductsAndFacets(subcategory, true, queryParams);
    products = subcatData?.products || [];
    totalProducts = subcatData?.total || products.length;
    totalPages = subcatData?.totalPages || Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    
    activeSubcategory = subcatData?.subcategory;
    activeCategory = subcatData?.category;
    
    const catName = activeCategory ? (activeCategory.name_ar || activeCategory.name) : (category || '');
    const subcatName = activeSubcategory ? (activeSubcategory.name_ar || activeSubcategory.name) : subcategory;
    
    titleText = subcatName;
    
    breadcrumbs = [];
    if (activeCategory) {
      breadcrumbs.push({ label: catName, href: `/products?category=${activeCategory.slug}` });
    }
    breadcrumbs.push({ label: subcatName });
    
    facets = subcatData?.facets || null;
  } else if (category) {
    const categoryData = await getProductsAndFacets(category, false, queryParams);
    products = categoryData?.products || [];
    totalProducts = categoryData?.total || products.length;
    totalPages = categoryData?.totalPages || Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    
    activeCategory = categoryData?.category;
    const catName = activeCategory ? (activeCategory.name_ar || activeCategory.name) : category;
    
    titleText = catName;
    breadcrumbs = [{ label: catName }];
    
    facets = categoryData?.facets || null;
  } else {
    titleText = 'كل المنتجات';
    const allProducts = await getAllProducts(currentPage, PRODUCTS_PER_PAGE);
    products = Array.isArray(allProducts) ? allProducts : (allProducts?.products || []);
    totalProducts = allProducts?.total || products.length;
    totalPages = allProducts?.totalPages || 1;
    breadcrumbs = [{ label: 'كل المنتجات' }];
  }

  // Helper to build URL with a specific value removed from a multi-select parameter
  const getRemoveFilterUrl = (key, valueToRemove) => {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([k, v]) => {
      if (k === key) {
        let vals = String(v).split(',');
        vals = vals.filter(x => x !== valueToRemove);
        if (vals.length > 0) {
          params.set(k, vals.join(','));
        }
      } else {
        params.set(k, v);
      }
    });
    // Keep standard navigation tags
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);
    if (q) params.set('q', q);
    
    params.set('page', '1');
    return `/products?${params.toString()}`;
  };

  // Helper to build URL with a single-value parameter removed entirely
  const getRemoveSingleFilterUrl = (key) => {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([k, v]) => {
      if (k !== key) {
        params.set(k, v);
      }
    });
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);
    if (q) params.set('q', q);
    
    params.set('page', '1');
    return `/products?${params.toString()}`;
  };

  // Helper to clear all filters
  const getRemoveAllFiltersUrl = () => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);
    if (q) params.set('q', q);
    return `/products?${params.toString()}`;
  };

  // Construct Active Chips
  const activeChips = [];
  
  if (queryParams.brand) {
    const brands = queryParams.brand.split(',');
    brands.forEach(b => {
      const facetBrand = facets?.brands?.find(fb => fb.name_en.toLowerCase() === b.toLowerCase());
      const label = facetBrand ? (facetBrand.name_ar || facetBrand.name_en) : b;
      activeChips.push({
        label: `البراند: ${label}`,
        removeUrl: getRemoveFilterUrl('brand', b)
      });
    });
  }

  if (queryParams.min_price) {
    activeChips.push({
      label: `السعر من: ${parseInt(queryParams.min_price).toLocaleString()} ج.م`,
      removeUrl: getRemoveSingleFilterUrl('min_price')
    });
  }
  if (queryParams.max_price) {
    activeChips.push({
      label: `السعر إلى: ${parseInt(queryParams.max_price).toLocaleString()} ج.م`,
      removeUrl: getRemoveSingleFilterUrl('max_price')
    });
  }

  if (queryParams.in_stock === 'true') {
    activeChips.push({
      label: 'المتوفر في المخزن فقط',
      removeUrl: getRemoveSingleFilterUrl('in_stock')
    });
  }

  if (queryParams.min_stores === '2') {
    activeChips.push({
      label: 'مقارنة في متجرين أو أكثر',
      removeUrl: getRemoveSingleFilterUrl('min_stores')
    });
  }

  if (facets?.attributes) {
    facets.attributes.forEach(attr => {
      const val = queryParams[attr.slug];
      if (val) {
        const values = String(val).split(',');
        values.forEach(v => {
          activeChips.push({
            label: `${attr.name_ar || attr.name_en}: ${v} ${attr.unit || ''}`,
            removeUrl: getRemoveFilterUrl(attr.slug, v)
          });
        });
      }
    });
  }

  const apiCategorySlug = activeCategory?.slug || category;
  const catInfo = apiCategorySlug ? CATEGORY_INFO[apiCategorySlug] : null;
  const CatIcon = catInfo?.icon || Package;

  return (
    <div className="min-h-screen bg-gray-50/50 pb-16 font-sans" dir="rtl">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumbs items={breadcrumbs} />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${catInfo ? catInfo.headerBg : 'from-gray-600 to-gray-800 shadow-gray-200/50'} flex items-center justify-center text-white shadow-lg`}>
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

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
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

          {/* Category Quick Navigation */}
          {!q && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 overflow-x-auto no-scrollbar">
              <Link
                href="/products"
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-200 shrink-0 ${
                  !category && !subcategory
                    ? 'bg-gray-900 text-white shadow-md' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                الكل
              </Link>
              {Object.entries(CATEGORY_INFO).map(([slug, info]) => {
                const Icon = info.icon;
                const isActive = apiCategorySlug === slug;
                return (
                  <Link
                    key={slug}
                    href={`/products?category=${slug}`}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-200 shrink-0 ${
                      isActive ? info.activeClass : info.inactiveClass
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

      {/* Main Grid: Sidebar + Product Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Filter Sidebar Column */}
          {facets && (
            <div className="w-full lg:w-72 shrink-0">
              <FilterSidebar facets={facets} />
            </div>
          )}

          {/* Product Listing Grid Column */}
          <div className="flex-grow">
            
            {/* Active Chips Row */}
            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6 p-4 bg-white/70 border border-gray-200/60 rounded-2xl shadow-xs animate-fade-in">
                <span className="text-xs font-bold text-gray-500 ml-2">الفلاتر النشطة:</span>
                {activeChips.map((chip, index) => (
                  <Link
                    key={index}
                    href={chip.removeUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:border-red-300 hover:text-red-600 transition-all duration-200 shadow-2xs group"
                  >
                    <span>{chip.label}</span>
                    <X className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-colors" />
                  </Link>
                ))}
                <Link
                  href={getRemoveAllFiltersUrl()}
                  className="text-xs font-bold text-red-500 hover:text-red-600 mr-auto hover:underline"
                >
                  مسح الكل
                </Link>
              </div>
            )}

            {/* Products Grid */}
            {products.length > 0 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
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
              <div className="text-center py-20 animate-fade-in">
                <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-200 shadow-sm p-10">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gray-50 rounded-2xl flex items-center justify-center">
                    <Package className="w-10 h-10 text-gray-300" />
                  </div>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-2">لا توجد منتجات مطابقة</h2>
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                    جرّب إزالة بعض فلاتر التصفية أو البحث عن كلمة رئيسية أخرى.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-2 justify-center">
                    <Link 
                      href={getRemoveAllFiltersUrl()}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm shadow-sm"
                    >
                      إلغاء كافة الفلاتر
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

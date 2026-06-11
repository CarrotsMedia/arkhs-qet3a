import { notFound } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { Star, Truck, ShieldCheck, MapPin, Store, ArrowRight, ExternalLink, Tag } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const STORE_DOMAINS = {
  'sigma': 'sigma-computer.com',
  'badr-group': 'badrgroup.com',
  'maximum-hardware': 'maximumhardware.com',
  'compumarts': 'compumarts.com',
  'noon': 'noon.com',
  'amazon': 'amazon.eg',
  'btech': 'btech.com',
  'dubaiphone': 'dubaiphone.net',
  'dream2000': 'dream2000.com',
  'alsheikhstores': 'alsheikhstores.com',
  'rayashop': 'rayashop.com',
  '2b': '2b.com.eg',
  'jumia': 'jumia.com.eg'
};

function getStoreLogo(slug) {
  const domain = STORE_DOMAINS[slug];
  if (domain) {
    return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
  }
  return null;
}

async function getProduct(id) {
  try {
    const res = await fetch(`${API_URL}/api/products/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    return {
      title: 'المنتج غير موجود',
    };
  }

  const name = product.merged_name || product.name;
  const description = product.description || `اشترِ ${name} بأفضل سعر وقارن بين المتاجر.`;
  const image = product.image_url || product.image;

  return {
    title: name,
    description: description,
    openGraph: {
      title: name,
      description: description,
      images: image ? [image] : [],
    }
  };
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  const name = product.merged_name || product.name;
  const image = product.image_url || product.image;
  const brand = product.brand || "Unknown";
  const lowestPrice = product.offers && product.offers.length > 0 ? product.offers[0].price_egp : product.lowestPrice || 0;
  const highestPrice = product.offers && product.offers.length > 1 ? product.offers[product.offers.length - 1].price_egp : lowestPrice;
  const savings = highestPrice - lowestPrice;
  
  const rating = product.rating || 4.8;
  const reviewCount = product.reviewCount || 156;

  // Build breadcrumbs
  const breadcrumbItems = [
    { label: 'المنتجات', href: '/products' },
    { label: name },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 pb-16 font-sans" dir="rtl">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Image Section */}
            <div className="p-6 md:p-10 bg-gradient-to-br from-gray-50 to-white border-b md:border-b-0 md:border-l border-gray-100">
              <div className="aspect-square rounded-2xl bg-white border border-gray-100 p-8 flex items-center justify-center shadow-inner">
                <img 
                  src={image} 
                  alt={name} 
                  className="w-full h-full object-contain animate-scale-in" 
                />
              </div>
            </div>

            {/* Product Info */}
            <div className="flex flex-col p-6 md:p-10">
              {/* Brand & Rating */}
              <div className="flex items-center gap-2.5 mb-4 animate-slide-up stagger-1 opacity-0">
                <span className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1 rounded-lg">
                  {brand}
                </span>
                <div className="flex items-center text-sm text-gray-500">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400 ml-1" />
                  <span className="font-bold text-gray-900 ml-1">{rating}</span>
                  <span className="text-gray-400">({reviewCount} تقييم)</span>
                </div>
              </div>

              {/* Product Name */}
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-6 leading-tight animate-slide-up stagger-2 opacity-0">
                {name}
              </h1>

              {/* Price Block */}
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl p-5 mb-6 border border-emerald-100/50 animate-slide-up stagger-3 opacity-0">
                <div className="text-sm font-semibold text-gray-500 mb-1">أفضل سعر متاح</div>
                <div className="text-4xl font-black text-gray-900 mb-1">
                  {lowestPrice.toLocaleString()} <span className="text-lg font-bold text-gray-400">ج.م</span>
                </div>
                {savings > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-700">
                      وفّر حتى {savings.toLocaleString()} ج.م مقارنة بأغلى متجر
                    </span>
                  </div>
                )}
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-2 gap-3 mb-6 animate-slide-up stagger-4 opacity-0">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  مقارنة موثوقة
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Truck className="w-4 h-4 text-blue-500" />
                  شحن لجميع المحافظات
                </div>
              </div>

              {/* Offers Table */}
              <div className="mt-auto border border-gray-200 rounded-2xl overflow-hidden animate-slide-up stagger-5 opacity-0">
                <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-200 font-bold text-gray-900 flex items-center gap-2 text-sm">
                  <Store className="w-4.5 h-4.5 text-gray-500" />
                  مقارنة الأسعار ({product.offers?.length || 0} متاجر)
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  {product.offers?.map((offer, idx) => {
                    const logoUrl = getStoreLogo(offer.store_slug);
                    const isCheapest = idx === 0;
                    return (
                      <div
                        key={idx}
                        className={`p-4 flex items-center justify-between hover:bg-gray-50/80 transition-all duration-200 ${isCheapest ? 'bg-emerald-50/30' : ''}`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className={`w-11 h-11 bg-white border ${isCheapest ? 'border-emerald-200' : 'border-gray-200'} rounded-xl flex items-center justify-center p-2 relative overflow-hidden shadow-sm`}>
                            {logoUrl ? (
                              <img 
                                src={logoUrl} 
                                alt={offer.store_name} 
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Store className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900">{offer.store_name}</span>
                              {isCheapest && (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">
                                  أرخص سعر
                                </span>
                              )}
                            </div>
                            <div className={`font-extrabold text-lg mt-0.5 ${isCheapest ? 'text-emerald-700' : 'text-gray-900'}`}>
                              {offer.price_egp.toLocaleString()} <span className="text-xs font-semibold text-gray-400">ج.م</span>
                            </div>
                            {offer.in_stock !== false && (
                              <div className="text-xs text-green-600 flex items-center gap-1 mt-0.5 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                متوفر
                              </div>
                            )}
                          </div>
                        </div>
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 shadow-sm ${
                            isCheapest
                              ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-emerald-200/50'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {isCheapest ? 'اشترِ الآن' : 'زيارة المتجر'}
                        </a>
                      </div>
                    );
                  })}
                  {!product.offers?.length && (
                    <div className="p-8 text-center">
                      <Store className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 font-medium">لا توجد عروض متاحة حالياً</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back to products link */}
        <div className="mt-6 text-center animate-fade-in">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            العودة لقائمة المنتجات
          </Link>
        </div>
      </div>
    </div>
  );
}

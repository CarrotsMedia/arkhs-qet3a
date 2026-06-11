import Link from "next/link";
import { Star, TrendingDown, TrendingUp, Store } from "lucide-react";

export default function ProductCard({ product, index = 0 }) {
  const id = product.product_id || product.id;
  const name = product.merged_name || product.name;
  const image = product.image_url || product.image;
  const brand = product.brand || "Unknown";
  // The API returns offers sorted by cheapest/in-stock first.
  const lowestPrice = product.offers && product.offers.length > 0 ? product.offers[0].price_egp : product.lowestPrice || 0;
  const storeCount = product.offers ? product.offers.length : product.storeCount || 0;
  
  // Simulated rating if not provided by backend
  const rating = product.rating || 4.5;
  const reviewCount = product.reviewCount || Math.floor(Math.random() * 500) + 10;
  
  // Calculate price change based on highest discount among offers
  let discount = 0;
  if (product.offers) {
    product.offers.forEach(o => {
      if (o.discount_pct && o.discount_pct > discount) discount = o.discount_pct;
    });
  }
  const priceChange = product.priceChange || (discount > 0 ? -discount : 0);
  const priceDown = priceChange < 0;
  const priceUp = priceChange > 0;

  // Stagger animation class
  const staggerClass = index < 10 ? `stagger-${index + 1}` : '';

  return (
    <Link
      href={`/product/${id}`}
      className={`group flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 opacity-0 animate-slide-up ${staggerClass}`}
    >
      {/* Image */}
      <div className="relative aspect-square bg-gradient-to-b from-gray-50 to-white border-b border-gray-100 overflow-hidden">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover p-4 group-hover:scale-105 transition-transform duration-500 ease-out"
        />
        {priceDown && (
          <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg px-2 py-1 text-xs font-bold text-white shadow-md shadow-emerald-200/50">
            <TrendingDown className="w-3 h-3" />
            {Math.abs(priceChange)}%−
          </div>
        )}
        {storeCount > 1 && (
          <div className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-gray-200/60 rounded-lg px-2 py-1 text-xs font-medium text-gray-600">
            <Store className="w-3 h-3" />
            {storeCount} متاجر
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-3.5 gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className="bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5 text-xs font-semibold text-gray-600">
            {brand}
          </span>
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {rating}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors duration-200" dir="auto">
          {name}
        </h3>

        <div className="mt-auto flex items-end justify-between pt-2.5 border-t border-gray-100">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-gray-400">يبدأ من</span>
            <span className="text-lg font-bold text-gray-900 tracking-tight leading-tight">
              {lowestPrice.toLocaleString()} <span className="text-xs font-semibold text-gray-400">ج.م</span>
            </span>
          </div>
          {priceDown && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              <TrendingDown className="w-3 h-3" />
              {Math.abs(priceChange)}%
            </span>
          )}
          {priceUp && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md">
              <TrendingUp className="w-3 h-3" />
              {priceChange}%
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

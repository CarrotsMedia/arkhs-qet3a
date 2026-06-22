"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Star, Truck, ShieldCheck, MapPin, Store, ArrowRight, ExternalLink, Tag, Cpu, HardDrive, Palette } from "lucide-react";
import Link from 'next/link';

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

const COLOR_BG_MAP = {
  black: '#1f2937',
  white: '#f9fafb',
  blue: '#2563eb',
  green: '#16a34a',
  silver: '#cbd5e1',
  gold: '#fef08a',
  gray: '#6b7280',
  grey: '#6b7280',
  titanium: '#94a3b8',
  purple: '#9333ea',
  red: '#dc2626',
  pink: '#ec4899',
  yellow: '#eab308 border border-yellow-500',
};

export default function ProductDetailsInteractive({ product, searchParams }) {
  const name = product.merged_name || product.name;
  const brand = product.brand || "Unknown";
  const rating = product.rating || 4.8;
  const reviewCount = product.reviewCount || 156;

  // 1. Gather all unique Storage and RAM values
  const allStorages = useMemo(() => {
    return Array.from(new Set(product.variants.map(v => v.storage_gb).filter(Boolean))).sort((a, b) => a - b);
  }, [product.variants]);

  const allRams = useMemo(() => {
    return Array.from(new Set(product.variants.map(v => v.ram_gb).filter(Boolean))).sort((a, b) => a - b);
  }, [product.variants]);

  // 2. Selection states
  const [selectedStorage, setSelectedStorage] = useState(null);
  const [selectedRam, setSelectedRam] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);

  // Initialize and handle URL deep-linking / default chepest variant
  useEffect(() => {
    const urlStorage = searchParams?.storage ? parseInt(searchParams.storage, 10) : null;
    const urlRam = searchParams?.ram ? parseInt(searchParams.ram, 10) : null;
    const urlColor = searchParams?.color || null;

    let targetVariant = null;

    // Try to find variant matching storage and ram from URL
    if (urlStorage && urlRam) {
      targetVariant = product.variants.find(v => v.storage_gb === urlStorage && v.ram_gb === urlRam);
    }

    // Fallback: If no match or not provided, find the cheapest variant (by minimum offer price)
    if (!targetVariant) {
      let cheapestVar = null;
      let minPrice = Infinity;
      for (const v of product.variants) {
        const activeOffers = v.offers || [];
        if (activeOffers.length > 0) {
          const cheapestOfferPrice = Math.min(...activeOffers.map(o => o.price_egp));
          if (cheapestOfferPrice < minPrice) {
            minPrice = cheapestOfferPrice;
            cheapestVar = v;
          }
        }
      }
      targetVariant = cheapestVar || product.variants[0];
    }

    if (targetVariant) {
      setSelectedStorage(targetVariant.storage_gb);
      setSelectedRam(targetVariant.ram_gb);

      // Resolve color selection
      const colors = Array.from(new Set((targetVariant.offers || []).map(o => o.color_en).filter(Boolean)));
      if (urlColor && colors.some(c => c.toLowerCase() === urlColor.toLowerCase())) {
        const matchedColor = colors.find(c => c.toLowerCase() === urlColor.toLowerCase());
        setSelectedColor(matchedColor);
      } else {
        // Fallback: Select the color of the cheapest offer of this variant
        const sortedOffers = [...(targetVariant.offers || [])].sort((a, b) => a.price_egp - b.price_egp);
        setSelectedColor(sortedOffers[0]?.color_en || null);
      }
    }
  }, [searchParams, product.variants]);

  // Sync state changes back to the URL parameters
  useEffect(() => {
    if (selectedStorage && selectedRam) {
      const params = new URLSearchParams();
      params.set('storage', selectedStorage);
      params.set('ram', selectedRam);
      if (selectedColor) {
        params.set('color', selectedColor);
      }
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
    }
  }, [selectedStorage, selectedRam, selectedColor]);

  // 3. Find active variant based on current RAM & Storage
  const selectedVariant = useMemo(() => {
    return product.variants.find(v => v.storage_gb === selectedStorage && v.ram_gb === selectedRam);
  }, [product.variants, selectedStorage, selectedRam]);

  // 4. Determine valid RAMs for selected Storage (for disabling invalid combinations)
  const validRamsForStorage = useMemo(() => {
    if (!selectedStorage) return new Set();
    return new Set(product.variants.filter(v => v.storage_gb === selectedStorage).map(v => v.ram_gb));
  }, [product.variants, selectedStorage]);

  // 5. Determine valid Storages for selected RAM (for disabling invalid combinations)
  const validStoragesForRam = useMemo(() => {
    if (!selectedRam) return new Set();
    return new Set(product.variants.filter(v => v.ram_gb === selectedRam).map(v => v.storage_gb));
  }, [product.variants, selectedRam]);

  // 6. Gather color options for the selected variant's offers
  const colorOptions = useMemo(() => {
    if (!selectedVariant) return [];
    const colors = selectedVariant.offers
      .map(o => o.color_en)
      .filter(Boolean)
      .map(c => c.trim());
    return Array.from(new Set(colors));
  }, [selectedVariant]);

  // Update selected color if it is no longer valid for the selected variant
  useEffect(() => {
    if (colorOptions.length > 0 && selectedColor && !colorOptions.includes(selectedColor)) {
      setSelectedColor(colorOptions[0]);
    } else if (colorOptions.length === 0) {
      setSelectedColor(null);
    }
  }, [colorOptions, selectedColor]);

  // 7. Filter offers for the active variant by color
  const filteredOffers = useMemo(() => {
    if (!selectedVariant) return [];
    const offers = selectedVariant.offers || [];
    if (selectedColor) {
      const matched = offers.filter(o => o.color_en === selectedColor);
      return matched.length > 0 ? matched : offers; // fallback to all offers if selected color has no offers
    }
    return offers;
  }, [selectedVariant, selectedColor]);

  // 8. Calculations for active price block
  const activeCheapestOffer = useMemo(() => {
    if (filteredOffers.length === 0) return null;
    return [...filteredOffers].sort((a, b) => a.price_egp - b.price_egp)[0];
  }, [filteredOffers]);

  const activeLowestPrice = activeCheapestOffer ? activeCheapestOffer.price_egp : 0;
  const activeHighestPrice = useMemo(() => {
    if (filteredOffers.length === 0) return 0;
    const prices = filteredOffers.map(o => o.price_egp);
    return Math.max(...prices);
  }, [filteredOffers]);

  const activeSavings = activeHighestPrice - activeLowestPrice;

  // Active image url (checks variant-specific image or falls back to main product image)
  const activeImage = selectedVariant?.image_url || product.image_url;

  // 9. Data for the Variant Availability Summary Table
  const variantSummaries = useMemo(() => {
    return product.variants.map(v => {
      const vOffers = v.offers || [];
      const lowestPrice = vOffers.length > 0 ? Math.min(...vOffers.map(o => o.price_egp)) : null;
      const storeCount = vOffers.length;
      const isAvailable = vOffers.some(o => o.availability === 'in_stock');
      const specLabel = `${v.storage_gb >= 1024 ? `${v.storage_gb / 1024}TB` : `${v.storage_gb}GB`} / ${v.ram_gb}GB RAM`;

      return {
        variant_id: v.variant_id,
        storage_gb: v.storage_gb,
        ram_gb: v.ram_gb,
        specLabel,
        lowestPrice,
        storeCount,
        isAvailable
      };
    }).sort((a, b) => {
      if (a.storage_gb !== b.storage_gb) return a.storage_gb - b.storage_gb;
      return a.ram_gb - b.ram_gb;
    });
  }, [product.variants]);

  // Handle clicking a row in the summary table
  const handleVariantClick = (storage, ram) => {
    setSelectedStorage(storage);
    setSelectedRam(ram);
    // Find matching variant to reset color
    const v = product.variants.find(varItem => varItem.storage_gb === storage && varItem.ram_gb === ram);
    if (v) {
      const colors = Array.from(new Set((v.offers || []).map(o => o.color_en).filter(Boolean)));
      setSelectedColor(colors[0] || null);
    }
  };

  const getSwatchBgStyle = (colorName) => {
    const key = colorName.toLowerCase();
    const style = { backgroundColor: COLOR_BG_MAP[key] || '#e2e8f0' };
    return style;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
      {/* Right Column: Image and Specs Summary (Grid Col 5) */}
      <div className="md:col-span-5 flex flex-col gap-6">
        <div className="p-6 bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-3xl shadow-sm flex items-center justify-center min-h-[350px]">
          <div className="aspect-square w-full max-w-[280px] p-4 flex items-center justify-center bg-white rounded-2xl border border-gray-50 shadow-inner">
            <img 
              src={activeImage} 
              alt={name} 
              className="w-full h-full object-contain transition-all duration-300 transform scale-100 hover:scale-105" 
            />
          </div>
        </div>

        {/* Dynamic Selectors */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3 text-base">
            <Cpu className="w-5 h-5 text-emerald-600" />
            تخصيص المواصفات
          </h3>

          {/* Storage Selection */}
          <div className="flex flex-col gap-2.5">
            <span className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4" />
              الذاكرة الداخلية:
            </span>
            <div className="flex flex-wrap gap-2">
              {allStorages.map(storage => {
                const label = storage >= 1024 ? `${storage / 1024} تيرابايت` : `${storage} جيجابايت`;
                const isSelected = selectedStorage === storage;
                const isPossible = validStoragesForRam.size === 0 || validStoragesForRam.has(storage);

                return (
                  <button
                    key={storage}
                    onClick={() => {
                      if (!isPossible) {
                        // Find first valid RAM for this storage
                        const firstValidRam = product.variants.find(v => v.storage_gb === storage)?.ram_gb;
                        if (firstValidRam) setSelectedRam(firstValidRam);
                      }
                      setSelectedStorage(storage);
                    }}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100 scale-105'
                        : isPossible
                          ? 'bg-white border-gray-200 text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                          : 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-50 line-through'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RAM Selection */}
          <div className="flex flex-col gap-2.5">
            <span className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
              <Cpu className="w-4 h-4" />
              الذاكرة العشوائية (الرام):
            </span>
            <div className="flex flex-wrap gap-2">
              {allRams.map(ram => {
                const label = `${ram} جيجا رام`;
                const isSelected = selectedRam === ram;
                const isPossible = validRamsForStorage.size === 0 || validRamsForStorage.has(ram);

                return (
                  <button
                    key={ram}
                    onClick={() => {
                      if (!isPossible) {
                        // Find first valid Storage for this RAM
                        const firstValidStorage = product.variants.find(v => v.ram_gb === ram)?.storage_gb;
                        if (firstValidStorage) setSelectedStorage(firstValidStorage);
                      }
                      setSelectedRam(ram);
                    }}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100 scale-105'
                        : isPossible
                          ? 'bg-white border-gray-200 text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                          : 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-50 line-through'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Selection */}
          {colorOptions.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
                <Palette className="w-4 h-4" />
                اللون المتاح:
              </span>
              <div className="flex flex-wrap gap-3">
                {colorOptions.map(color => {
                  const isSelected = selectedColor === color;
                  const hasColorMapping = COLOR_BG_MAP[color.toLowerCase()];

                  return (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/40 text-emerald-800 ring-2 ring-emerald-500/20 scale-105'
                          : 'border-gray-200 hover:border-gray-300 bg-white text-gray-800'
                      }`}
                      title={color}
                    >
                      {/* Color Preview Swatch */}
                      <span 
                        className="w-4 h-4 rounded-full border border-gray-300 shadow-sm transition-transform duration-200 group-hover:scale-110"
                        style={getSwatchBgStyle(color)}
                      />
                      <span>{color}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Left Column: Price Block, Variant summary Table and Offers (Grid Col 7) */}
      <div className="md:col-span-7 flex flex-col gap-6">
        {/* Brand & Rating */}
        <div className="flex items-center gap-2.5">
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
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
          {name}
        </h1>

        {/* Price Block */}
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-3xl p-6 border border-emerald-100/50 shadow-sm">
          <div className="text-sm font-semibold text-gray-500 mb-1">أفضل سعر للنسخة المحددة</div>
          <div className="text-4xl font-black text-gray-900 mb-1">
            {activeLowestPrice > 0 ? (
              <>
                {activeLowestPrice.toLocaleString()} <span className="text-lg font-bold text-gray-400">ج.م</span>
              </>
            ) : (
              <span className="text-2xl text-gray-400">غير متوفر حالياً</span>
            )}
          </div>
          {activeSavings > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-emerald-700">
                وفّر حتى {activeSavings.toLocaleString()} ج.م مقارنة بأغلى متجر
              </span>
            </div>
          )}
        </div>

        {/* Variant Availability Summary Table */}
        <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 font-bold text-gray-900 flex items-center gap-2 text-sm">
            <Cpu className="w-4.5 h-4.5 text-gray-600" />
            ملخص توفر النسخ ومقارنة سريعة
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-gray-500 font-bold border-b border-gray-100">
                  <th className="px-5 py-3 font-semibold">النسخة</th>
                  <th className="px-5 py-3 font-semibold text-center">أقل سعر</th>
                  <th className="px-5 py-3 font-semibold text-center">عدد المتاجر</th>
                  <th className="px-5 py-3 font-semibold text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {variantSummaries.map((summary) => {
                  const isActive = summary.storage_gb === selectedStorage && summary.ram_gb === selectedRam;
                  return (
                    <tr
                      key={summary.variant_id}
                      onClick={() => handleVariantClick(summary.storage_gb, summary.ram_gb)}
                      className={`cursor-pointer transition-colors hover:bg-emerald-50/20 ${
                        isActive ? 'bg-emerald-50/40 font-bold text-emerald-950 border-r-4 border-r-emerald-600' : 'text-gray-700'
                      }`}
                    >
                      <td className="px-5 py-3.5 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-600 animate-pulse' : 'bg-transparent'}`} />
                        {summary.specLabel}
                      </td>
                      <td className="px-5 py-3.5 text-center font-extrabold text-gray-900">
                        {summary.lowestPrice ? `${summary.lowestPrice.toLocaleString()} ج.م` : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded-md">
                          {summary.storeCount} متاجر
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                          summary.isAvailable 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${summary.isAvailable ? 'bg-green-600' : 'bg-red-600'}`} />
                          {summary.isAvailable ? 'متوفر' : 'غير متوفر'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            مقارنة موثوقة بنسبة 100%
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Truck className="w-4 h-4 text-blue-500" />
            شحن لجميع المحافظات
          </div>
        </div>

        {/* Offers Table */}
        <div className="border border-gray-100 rounded-3xl overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 font-bold text-gray-900 flex items-center gap-2 text-sm justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-4.5 h-4.5 text-gray-600" />
              عروض الأسعار المتاحة ({filteredOffers.length} متاجر)
            </div>
            {selectedColor && (
              <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-md">
                اللون: {selectedColor}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {filteredOffers.map((offer, idx) => {
              const logoUrl = getStoreLogo(offer.store_slug);
              const isCheapest = idx === 0;
              return (
                <div
                  key={idx}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/80 transition-all duration-200 ${
                    isCheapest ? 'bg-emerald-50/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 bg-white border ${
                      isCheapest ? 'border-emerald-200' : 'border-gray-200'
                    } rounded-xl flex items-center justify-center p-2 shadow-sm`}>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{offer.store_name}</span>
                        {isCheapest && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">
                            أرخص سعر
                          </span>
                        )}
                        {offer.color_en && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-md">
                            {offer.color_en}
                          </span>
                        )}
                      </div>
                      <div className={`font-extrabold text-xl mt-1 ${isCheapest ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {offer.price_egp.toLocaleString()} <span className="text-xs font-semibold text-gray-400">ج.م</span>
                      </div>
                      <div className="text-xs text-green-600 flex items-center gap-1 mt-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        متوفر
                      </div>
                    </div>
                  </div>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-200 shadow-sm w-full sm:w-auto ${
                      isCheapest
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-emerald-100/50 hover:shadow-emerald-200/50'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {isCheapest ? 'اشترِ الآن' : 'زيارة المتجر'}
                  </a>
                </div>
              );
            })}
            {filteredOffers.length === 0 && (
              <div className="p-8 text-center">
                <Store className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">لا توجد عروض متاحة لهذه النسخة حالياً</p>
              </div>
            )}
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-2 text-center">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <ArrowRight className="w-4 h-4 ml-1" />
            العودة لقائمة المنتجات
          </Link>
        </div>
      </div>
    </div>
  );
}

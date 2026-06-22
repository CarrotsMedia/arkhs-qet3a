import { notFound } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '../../../components/Breadcrumbs';
import ProductDetailsInteractive from '../../../components/ProductDetailsInteractive';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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

  const canonicalUrl = `${API_URL}/product/${id}`;

  return {
    title: name,
    description: description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: name,
      description: description,
      images: image ? [image] : [],
    }
  };
}

export default async function ProductPage({ params, searchParams }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  const name = product.merged_name || product.name;

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
        <ProductDetailsInteractive product={product} searchParams={resolvedSearchParams} />
      </div>
    </div>
  );
}

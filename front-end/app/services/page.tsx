'use client'

// Services listing page — "Elite service providers" layout.
// Horizontal worker cards with image on the left, content on the right.
// Left sidebar has multi-select category filter with counts, price range,
// rating radio, and availability checkboxes.
//
// URL params understood:
//   ?category=<id1,id2,...>   — from home page / navbar autocomplete / sidebar
//   ?q=<service name>         — from navbar autocomplete text search
//
// Backend endpoint: GET /api/workers (see worker.controller.js for filter logic)

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Star, MapPin, Clock, Briefcase, BadgeCheck, ChevronDown,
  ChevronLeft, Grid3x3, SlidersHorizontal, MessageCircleQuestion, ShoppingBag
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import {
  queryKeys,
  fetchCategories,
  fetchWorkers,
  type WorkersFilters,
} from '@/lib/queries'
import type { WorkerProfile, WorkerService } from '@/lib/types'

// Availability options — UI is wired but the filter is cosmetic until the
// backend has a real availability field on WorkerProfile. Selecting these
// doesn't currently narrow results.
type AvailabilityOption = 'available_now' | 'responds_hour' | 'emergency_24_7'

function ServicesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isLoggedIn } = useAuth()
  const { findOrCreateConversation } = useChat()

  // Per-service action handlers.
  //
  // Ask: open or find a 1:1 conversation with the worker, then redirect to
  // /messages/<conv>?service=<id>. MessageThread reads that query param and
  // prefills the composer with a template referencing this service.
  //
  // Order: redirect straight to /checkout?service=<id>. The checkout page
  // handles its own auth gate and fetches the service details.
  //
  // Both fall back to /signin with a redirect-back query when the user is
  // logged out, so the user lands on the same path post-login.
  const handleAskService = async (service: WorkerService, worker: WorkerProfile) => {
    if (!isLoggedIn) {
      router.push('/signin?redirect=/services')
      return
    }
    const otherUserId = worker.userId?._id
    if (!otherUserId) return
    try {
      const conv = await findOrCreateConversation(otherUserId)
      if (conv) router.push(`/messages/${conv._id}?service=${service._id}`)
    } catch (err) {
      console.error('Failed to open conversation:', err)
    }
  }

  const handleOrderService = (service: WorkerService) => {
    const target = `/checkout?service=${service._id}`
    if (!isLoggedIn) {
      router.push(`/signin?redirect=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  // ─── Filter state ───────────────────────────────────────────────
  // Categories are multi-select (checkboxes), matching the new design.
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minRating, setMinRating] = useState('')
  const [availability, setAvailability] = useState<AvailabilityOption[]>(['available_now'])
  const [sort, setSort] = useState('rating')
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Which cards have their "عرض المزيد" services list expanded ──
  // Cards show the first N services by default; clicking "عرض المزيد"
  // adds the card id to this set to render all services.
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // ─── Read URL params on mount and when they change ──────────────
  useEffect(() => {
    const categoryParam = searchParams.get('category')
    // URL param is comma-separated; split into an array for the checkbox state
    setSelectedCategories(categoryParam ? categoryParam.split(',').filter(Boolean) : [])
    setSearchQuery(searchParams.get('q') || '')
    setCurrentPage(1)
  }, [searchParams])

  // ─── Server data via TanStack Query ─────────────────────────────
  // Categories rarely change — the 60s default staleTime + 5min gcTime keep
  // them effectively cached for a full session of browsing.
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(true),
    queryFn: () => fetchCategories(true),
  })
  const categories = categoriesQuery.data?.categories ?? []

  // Workers are keyed by the full filter object, so React Query treats every
  // filter combo as its own cache entry. Toggling between two category combos
  // returns instantly the second time. `placeholderData: keepPrevious` is the
  // (Query v5) recipe for "show stale results until the new query lands"
  // instead of flashing the skeleton on every keystroke.
  const workersFilters: WorkersFilters = {
    categories: selectedCategories,
    q: searchQuery,
    minPrice,
    maxPrice,
    minRating,
    sort,
    page: currentPage,
    limit: 10,
  }
  const workersQuery = useQuery({
    queryKey: queryKeys.workers(workersFilters),
    queryFn: () => fetchWorkers(workersFilters),
    placeholderData: (previous) => previous,
  })
  const workers = workersQuery.data?.workers ?? []
  const pagination = workersQuery.data?.pagination ?? { page: 1, limit: 10, total: 0, pages: 0 }
  // Show the skeleton on the very first load, but not on subsequent filter
  // changes (where we keep the previous results visible thanks to placeholder).
  const loading = workersQuery.isPending

  // ─── Filter handlers — reset to page 1 on any change ────────────
  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
    setCurrentPage(1)
  }

  const toggleAvailability = (opt: AvailabilityOption) => {
    setAvailability(prev =>
      prev.includes(opt) ? prev.filter(a => a !== opt) : [...prev, opt]
    )
  }

  const clearFilters = () => {
    setSelectedCategories([])
    setSearchQuery('')
    setMinPrice('')
    setMaxPrice('')
    setMinRating('')
    setAvailability(['available_now'])
    setSort('rating')
    setCurrentPage(1)
  }

  // ─── Helpers ────────────────────────────────────────────────────

  // Worker's category name for the card subtitle.
  const getSpecialty = (worker: WorkerProfile) =>
    worker.Category?.name || worker.services?.[0]?.name || 'خدمات متنوعة'

  // Lowest service price — used for the "يبدأ من X ج.م" footer.
  const getStartingPrice = (worker: WorkerProfile) => {
    if (worker.priceRange?.min) return worker.priceRange.min
    const prices = (worker.services || [])
      .map(s => s.typeofService === 'range' ? (s.priceRange?.min || 0) : s.price)
      .filter(p => p > 0)
    return prices.length > 0 ? Math.min(...prices) : 0
  }

  // Format a service row's price + unit. Mirrors how the design labels
  // prices: "XXX ج.م / <unit>" when applicable, otherwise just the amount.
  const formatServicePrice = (service: WorkerService) => {
    if (service.typeofService === 'range' && service.priceRange) {
      return `${service.priceRange.min ?? 0} - ${service.priceRange.max ?? 0} ج.م`
    }
    const unit = service.typeofService === 'hourly' ? ' / الساعة' : ''
    return `${service.price ?? 0} ج.م${unit}`
  }

  // Is the worker "available now" (heuristic). Since we don't have a real
  // availability field yet, we mark workers with ratingAverage >= 4 as
  // available to mimic the design. Anyone else shows as "مشغول".
  const isWorkerAvailable = (worker: WorkerProfile) =>
    (worker.ratingAverage || 0) >= 4 || (worker.totalReviews || 0) > 0

  // Pretty sort label for the top-right dropdown.
  const sortLabels: Record<string, string> = {
    rating: 'الأعلى تقييماً',
    price: 'السعر (الأقل)',
    mostOrdered: 'الأكثر طلباً',
    alphabetical: 'أبجدي',
  }

  // Active category names (for the page subtitle)
  const activeCategoryNames = categories
    .filter(c => selectedCategories.includes(c._id))
    .map(c => c.name)

  // Breadcrumb tail — "جميع الخدمات" by default, category names if filtering.
  const breadcrumbTail = activeCategoryNames.length > 0
    ? activeCategoryNames.join('، ')
    : 'جميع الخدمات'

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-7xl mx-auto">

        {/* ============ HEADER: breadcrumb + title + sort dropdowns ============ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">

          {/* Right side (first in DOM → appears right in RTL) — title + breadcrumb */}
          <div className="text-right">
            <nav className="text-sm text-on-surface-variant mb-2">
              <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
              <span className="mx-2">/</span>
              <Link href="/services" className="hover:text-primary transition-colors">الخدمات</Link>
              <span className="mx-2">/</span>
              <span className="text-on-surface">{breadcrumbTail}</span>
            </nav>
            <h1 className="text-3xl lg:text-4xl font-black text-on-surface mb-1 tracking-tight">
              نخبة مزودي الخدمات
            </h1>
            <p className="text-on-surface-variant text-sm">
              <span className="font-bold text-on-surface">{pagination.total}</span> مزود موثّق متاح — مرتّبين حسب التقييم والاستجابة.
            </p>
            {/* Search chip — shows if arrived via navbar search */}
            {searchQuery && (
              <div className="mt-3 inline-flex items-center gap-2 bg-primary-container/30 text-primary px-3 py-1.5 rounded-full">
                <span className="text-xs font-medium">نتائج البحث عن: <span className="font-bold">{searchQuery}</span></span>
                <button onClick={() => setSearchQuery('')} className="w-4 h-4 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center text-xs">×</button>
              </div>
            )}
          </div>

          {/* Left side (last in DOM → appears left in RTL) — sort + view dropdowns */}
          <div className="flex gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={sort}
                onChange={e => { setSort(e.target.value); setCurrentPage(1) }}
                className="bg-surface-container-lowest border-none rounded-xl pr-4 pl-10 py-2.5 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer shadow-sm"
              >
                {Object.entries(sortLabels).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            </div>
            {/* View mode (decorative — list view is the only mode for now) */}
            <div className="relative">
              <button className="bg-surface-container-lowest rounded-xl pr-4 pl-10 py-2.5 text-sm font-medium text-on-surface shadow-sm flex items-center gap-2">
                <Grid3x3 className="w-4 h-4 text-on-surface-variant" />
                طرق العرض
              </button>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ============ BODY: main content RIGHT + sidebar LEFT (RTL) ============ */}
        {/* DOM order = visual order in RTL reversed. Main first → appears right. */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ========== MAIN: worker cards stacked vertically ========== */}
          <section className="flex-1 min-w-0 space-y-5 order-2 lg:order-1">

            {loading ? (
              // Skeleton cards while loading
              <div className="space-y-5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-surface-container-lowest rounded-2xl h-64 animate-pulse" />
                ))}
              </div>
            ) : workers.length === 0 ? (
              <div className="text-center py-20 bg-surface-container-lowest rounded-2xl">
                <p className="text-on-surface-variant text-lg mb-2">لا يوجد مزودو خدمات</p>
                <p className="text-on-surface-variant text-sm">جرب تغيير الفلاتر</p>
                <button onClick={clearFilters} className="mt-4 text-primary font-semibold hover:underline">
                  مسح جميع الفلاتر
                </button>
              </div>
            ) : (
              workers.map(worker => {
                const expanded = expandedCards.has(worker._id)
                const allServices = worker.services || []
                const visibleServices = expanded ? allServices : allServices.slice(0, 3)
                const available = isWorkerAvailable(worker)
                const specialty = getSpecialty(worker)

                return (
                  <article
                    key={worker._id}
                    className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)] hover:shadow-[0_32px_40px_-16px_rgba(18,28,42,0.1)] transition-shadow"
                  >
                    {/* Card is horizontal on lg+: content first (right in RTL) + image second (left) */}
                    <div className="flex flex-col lg:flex-row">

                      {/* ─── Content (right side in RTL) ─── */}
                      <div className="flex-1 p-6 text-right">
                        {/* Header row: availability chip (left) + name + verified (right) */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Link
                              href={`/worker/${worker._id}`}
                              className="text-xl font-bold text-on-surface hover:text-primary transition-colors truncate"
                            >
                              {worker.userId?.firstName} {worker.userId?.lastName}
                            </Link>
                            <BadgeCheck className="w-5 h-5 text-primary shrink-0" />
                          </div>
                          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                            available
                              ? 'bg-green-50 text-green-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${available ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {available ? 'متاح الآن' : 'مشغول'}
                          </span>
                        </div>

                        {/* Specialty subtitle */}
                        <p className="text-on-surface-variant text-sm mb-4">{specialty}</p>

                        {/* Meta row: rating • projects • response time • location */}
                        <div className="flex items-center gap-4 flex-wrap text-xs text-on-surface-variant mb-5">
                          <span className="flex items-center gap-1.5">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            <span className="font-bold text-on-surface">{worker.ratingAverage?.toFixed(1) || '0.0'}</span>
                            <span>({worker.totalReviews || 0})</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5" />
                            <span>{worker.totalReviews || 0} مشروع</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>&lt; 30 دقيقة</span>
                          </span>
                          {worker.location && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{worker.location}</span>
                            </span>
                          )}
                        </div>

                        {/* Services list box */}
                        {allServices.length > 0 && (
                          <div className="bg-surface-container-low rounded-xl p-4 mb-5">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-bold text-on-surface">
                                الخدمات المتاحة ({allServices.length})
                              </h3>
                              {allServices.length > 3 && (
                                <button
                                  onClick={() => {
                                    const next = new Set(expandedCards)
                                    if (expanded) next.delete(worker._id); else next.add(worker._id)
                                    setExpandedCards(next)
                                  }}
                                  className="text-xs text-primary font-semibold hover:underline"
                                >
                                  {expanded ? 'عرض أقل' : 'عرض المزيد'}
                                </button>
                              )}
                            </div>
                            <div className="space-y-2">
                              {visibleServices.map(service => (
                                <div
                                  key={service._id}
                                  className="flex items-center justify-between gap-3 text-sm py-1"
                                >
                                  {/* Service name links to the new public detail page so the
                                      customer can read the description / see images / review
                                      pricing before committing to checkout. The "اطلب" button
                                      below stays as the fast-path for repeat buyers. */}
                                  <Link
                                    href={`/services/${service._id}`}
                                    className="text-on-surface hover:text-primary transition-colors truncate flex-1 min-w-0"
                                  >
                                    {service.name}
                                  </Link>
                                  <span className="text-on-surface-variant font-medium shrink-0">
                                    {formatServicePrice(service)}
                                  </span>
                                  {/* Per-service action buttons. The "اسأل" (ask) button is a
                                      secondary/ghost icon button that opens a chat pre-filled
                                      with a reference to this service. The "اطلب الآن" (order
                                      now) button is the primary CTA that navigates to /checkout
                                      for this specific serviceId. */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleAskService(service, worker)}
                                      title="استفسر عن هذه الخدمة"
                                      className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                                    >
                                      <MessageCircleQuestion className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOrderService(service)}
                                      title="اطلب هذه الخدمة الآن"
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
                                    >
                                      <ShoppingBag className="w-3.5 h-3.5" />
                                      <span>اطلب</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer: starting price (right) + "view profile" (left).
                            Per-service "ask" and "order" buttons now live on each
                            service row above, so the card-level CTAs shrink to just
                            a link to the worker's full profile where they can browse
                            all services + portfolio + reviews. */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <span className="text-xs text-on-surface-variant">يبدأ من </span>
                            <span className="text-xl font-black text-on-surface">{getStartingPrice(worker)}</span>
                            <span className="text-sm text-on-surface-variant"> ج.م</span>
                          </div>
                          <Link
                            href={
                              // When a category filter is active on the listing,
                              // carry it through to the worker profile so that
                              // page can filter its own services list too. If
                              // multiple categories are selected, pass the first
                              // as a pragmatic default (worker profile's filter
                              // chip is single-value).
                              selectedCategories.length > 0
                                ? `/worker/${worker._id}?category=${selectedCategories[0]}`
                                : `/worker/${worker._id}`
                            }
                            className="px-5 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 text-on-surface hover:bg-surface-container-high transition-colors"
                          >
                            عرض ملف الحرفي
                          </Link>
                        </div>
                      </div>

                      {/* ─── Image (left side in RTL) ─── */}
                      <div className="lg:w-72 h-48 lg:h-auto shrink-0 bg-surface-container-high relative overflow-hidden">
                        {worker.userId?.profileImage ? (
                          <img
                            src={worker.userId.profileImage}
                            alt={worker.userId.firstName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary-container/30 flex items-center justify-center text-primary font-black text-6xl">
                            {worker.userId?.firstName?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })
            )}

            {/* Pagination */}
            {pagination.pages > 1 && !loading && (
              <div className="flex justify-center items-center gap-2 pt-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5 rotate-180" />
                </button>
                {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-colors ${
                      currentPage === page
                        ? 'bg-primary text-white'
                        : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(pagination.pages, p + 1))}
                  disabled={currentPage === pagination.pages}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            )}
          </section>

          {/* ========== SIDEBAR (left in RTL) — filters panel ========== */}
          <aside className="w-full lg:w-72 shrink-0 order-1 lg:order-2">
            <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)] sticky top-24">

              {/* Header: title + clear all */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  تصفية النتائج
                </h2>
                <button onClick={clearFilters} className="text-primary text-xs font-semibold hover:underline">
                  مسح الكل
                </button>
              </div>

              {/* Category multi-select with service counts */}
              <div className="mb-6">
                <label className="block text-sm font-bold mb-3 text-right">القطاع</label>
                <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto">
                  {categories.length === 0 ? (
                    <p className="text-xs text-on-surface-variant">لا توجد فئات</p>
                  ) : (
                    categories.map(cat => {
                      const checked = selectedCategories.includes(cat._id)
                      return (
                        <label key={cat._id} className="flex items-center justify-between gap-3 cursor-pointer group">
                          <span className="text-xs text-on-surface-variant">{cat.serviceCount ?? 0}</span>
                          <span className="flex items-center gap-2 flex-1 justify-end min-w-0">
                            <span className={`text-sm truncate transition-colors ${checked ? 'text-primary font-semibold' : 'text-on-surface group-hover:text-primary'}`}>
                              {cat.name}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCategory(cat._id)}
                              className="w-4 h-4 text-primary rounded focus:ring-primary/20"
                            />
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Price range */}
              <div className="mb-6">
                <label className="block text-sm font-bold mb-3 text-right">نطاق السعر (ج.م)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="الأعلى"
                    value={maxPrice}
                    onChange={e => { setMaxPrice(e.target.value); setCurrentPage(1) }}
                    className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm text-center focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <input
                    type="number"
                    placeholder="الأدنى"
                    value={minPrice}
                    onChange={e => { setMinPrice(e.target.value); setCurrentPage(1) }}
                    className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm text-center focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>

              {/* Rating radio group */}
              <div className="mb-6">
                <label className="block text-sm font-bold mb-3 text-right">التقييم</label>
                <div className="space-y-2.5">
                  {[
                    { value: '4.5', label: '4.5 فما فوق' },
                    { value: '4',   label: '4 فما فوق' },
                    { value: '3.5', label: '3.5 فما فوق' },
                    { value: '',    label: 'الكل' },
                  ].map(opt => (
                    <label key={opt.value || 'all'} className="flex items-center justify-end gap-2 cursor-pointer group">
                      <span className="flex items-center gap-1 text-sm text-on-surface-variant group-hover:text-primary transition-colors">
                        {opt.value && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
                        <span>{opt.label}</span>
                      </span>
                      <input
                        type="radio"
                        name="rating"
                        checked={minRating === opt.value}
                        onChange={() => { setMinRating(opt.value); setCurrentPage(1) }}
                        className="text-primary focus:ring-primary/20"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Availability checkboxes (UI-only — see note at top of file) */}
              <div className="mb-6">
                <label className="block text-sm font-bold mb-3 text-right">التوفر</label>
                <div className="space-y-2.5">
                  {[
                    { value: 'available_now' as const,   label: 'متاح الآن' },
                    { value: 'responds_hour' as const,   label: 'يستجيب خلال ساعة' },
                    { value: 'emergency_24_7' as const,  label: 'طوارئ 24/7' },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center justify-end gap-2 cursor-pointer group">
                      <span className="text-sm text-on-surface-variant group-hover:text-primary transition-colors">
                        {opt.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={availability.includes(opt.value)}
                        onChange={() => toggleAvailability(opt.value)}
                        className="w-4 h-4 text-primary rounded focus:ring-primary/20"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Apply button — filters apply live but the button scrolls the user up */}
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary-container transition-colors shadow-sm"
              >
                تطبيق الفلاتر
              </button>
            </div>
          </aside>
        </div>
      </main>

      <footer className="w-full border-t border-border/15 bg-surface-container-low">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 gap-6 w-full max-w-7xl mx-auto">
          <div className="flex flex-col items-center md:items-end gap-2">
            <span className="text-lg font-bold text-on-surface">DK yet</span>
            <p className="text-sm text-right leading-6 text-on-surface-variant">منصتكم الأولى لخدمات الصيانة والمنزل المتكاملة</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">من نحن</Link>
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">الشروط والأحكام</Link>
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">سياسة الخصوصية</Link>
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">اتصل بنا</Link>
          </div>
          <div className="text-sm text-on-surface-variant">© ٢٠٢٤ DK yet. جميع الحقوق محفوظة</div>
        </div>
      </footer>
    </div>
  )
}

export default function ServicesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/30 animate-pulse" />
      </div>
    }>
      <ServicesContent />
    </Suspense>
  )
}

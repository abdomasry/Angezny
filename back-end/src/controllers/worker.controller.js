const mongoose = require("mongoose");
const WorkerProfile = require("../Models/Worker.Profile");
const WorkerServices = require("../Models/Worker.Services");
const Review = require("../Models/Review");
const ServiceRequest = require("../Models/Service.Request");
const { parsePagination, paginationMeta } = require("../lib/pagination");

// getWorkers — Returns a paginated, filtered, sorted list of workers
//
// This is the most complex endpoint so far. Here's the data flow:
//
// 1. Read query params from the URL (category, price, rating, sort, page)
// 2. Build a MongoDB filter object based on those params
// 3. Handle price filtering (tricky — price lives on WorkerServices, not WorkerProfile)
// 4. Query the database with populate (join related data)
// 5. Sort the results
// 6. Return paginated results
//
// Example URL: GET /api/workers?category=507f1f77&minPrice=50&maxPrice=200&minRating=4&sort=rating&page=1

// Escape regex-special characters so user input like "a+b" doesn't break the regex.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getWorkers = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      minRating,
      q,                // free-text search across service name + description
      sort = "rating",
    } = req.query;

    // Pagination via the shared helper — bounds-checked + capped at 100/page.
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    const filter = {
      // Only show approved workers (not pending or rejected verification).
      // Placed up front because it benefits from the compound index
      // { verificationStatus: 1, ratingAverage: -1 }.
      verificationStatus: "approved",
    };

    // ─── Category filter ──────────────────────────────────────
    // Accepts a single ID or a comma-separated list. Translates to a set of
    // worker IDs via the WorkerServices collection (workers are matched by
    // having at least one active service in the category).
    if (category) {
      const categoryIds = String(category).split(",").map(s => s.trim()).filter(Boolean);
      if (categoryIds.length > 0) {
        const workerIdsInCategory = await WorkerServices.distinct("workerID", {
          categoryId: { $in: categoryIds },
          active: true,
        });
        filter._id = { $in: workerIdsInCategory };
      }
    }

    // ─── Free-text search ────────────────────────────────────
    // Use Mongo's $text operator (backed by the WorkerServices text index on
    // name + description). For very short queries (≤ 2 chars) we fall back to
    // a regex prefix match — text search ignores stop-words and short tokens.
    if (q && q.trim()) {
      const trimmed = q.trim();
      const serviceFilter = { active: true };
      if (trimmed.length >= 3) {
        serviceFilter.$text = { $search: trimmed };
      } else {
        serviceFilter.name = new RegExp(`^${escapeRegex(trimmed)}`, "i");
      }
      const workerIdsMatchingQuery = await WorkerServices.distinct("workerID", serviceFilter);
      filter._id = filter._id
        ? { $in: filter._id.$in.filter(id => workerIdsMatchingQuery.some(qid => String(qid) === String(id))) }
        : { $in: workerIdsMatchingQuery };
    }

    if (minRating) {
      filter.ratingAverage = { $gte: parseFloat(minRating) };
    }

    // ─── Price filter ────────────────────────────────────────
    // Price lives on WorkerServices, not on WorkerProfile. Translate price
    // bounds → matching worker IDs, then intersect with whatever's already
    // accumulated in filter._id.
    if (minPrice || maxPrice) {
      const priceFilter = {};
      if (minPrice) priceFilter.$gte = parseFloat(minPrice);
      if (maxPrice) priceFilter.$lte = parseFloat(maxPrice);

      const matchingWorkerIds = await WorkerServices.distinct("workerID", {
        price: priceFilter,
        active: true,
      });
      filter._id = filter._id
        ? { $in: filter._id.$in.filter(id => matchingWorkerIds.some(mid => String(mid) === String(id))) }
        : { $in: matchingWorkerIds };
    }

    // ─── Sort ────────────────────────────────────────────────
    let sortObj;
    switch (sort) {
      case "price":         sortObj = { "priceRange.min": 1 }; break;
      case "rating":        sortObj = { ratingAverage: -1 }; break;
      case "mostOrdered":   sortObj = { totalReviews: -1 }; break;
      // Alphabetical can't be done in Mongo (populated field) — sorted
      // in-memory after fetch. createdAt is a stable interim.
      case "alphabetical":  sortObj = { createdAt: -1 }; break;
      default:              sortObj = { ratingAverage: -1 };
    }

    const total = await WorkerProfile.countDocuments(filter);

    let workers = await WorkerProfile.find(filter)
      .populate("userId", "firstName lastName profileImage")
      .populate("Category", "name image")
      .populate("serviceCategories", "name image")
      .populate({
        path: "services",
        match: {
          active: true,
          approvalStatus: "approved",
          ...(category && (() => {
            const ids = String(category).split(",").map(s => s.trim()).filter(Boolean);
            return ids.length > 1 ? { categoryId: { $in: ids } } : { categoryId: ids[0] };
          })()),
          ...(q && q.trim() && (
            q.trim().length >= 3
              ? { $text: { $search: q.trim() } }
              : { name: new RegExp(`^${escapeRegex(q.trim())}`, "i") }
          )),
        },
        select: "name description images price typeofService priceRange categoryId",
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limit);

    if (sort === "alphabetical") {
      workers = workers.sort((a, b) => {
        const nameA = a.userId?.firstName || "";
        const nameB = b.userId?.firstName || "";
        return nameA.localeCompare(nameB, "ar");
      });
    }

    res.json({
      workers,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.log("Worker listing error:", error.message);
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// ============================================================
// GET /api/workers/:id
// ============================================================
// Fetches a SINGLE worker's full profile by their WorkerProfile _id.
//
// This is the "public profile page" — anyone can view it (no auth needed).
// It's different from the dashboard endpoint (which is for the worker themselves).
//
// We populate 3 related collections:
//   - userId → get the worker's name, avatar, bio, location, join date
//   - Category → get the category name and image
//   - services → get all ACTIVE services this worker offers
//
// The nested populate on services.categoryId is a "deep populate":
//   First populate the services array, then WITHIN each service,
//   also populate the categoryId field. This gives us:
//     service.categoryId.name instead of just service.categoryId = "507f1f77..."
// ============================================================
const getWorkerById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const workerProfile = await WorkerProfile.findById(req.params.id)
      .populate("userId", "firstName lastName profileImage bio createdAt")
      .populate("Category", "name image")
      .populate("serviceCategories", "name image")
      .populate({
        path: "services",
        match: { active: true, approvalStatus: "approved" },
        select: "name description images price typeofService priceRange categoryId",
        populate: { path: "categoryId", select: "name" },
      });

    if (!workerProfile) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const orderStats = await ServiceRequest.aggregate([
      {
        $match: {
          workerId: new mongoose.Types.ObjectId(workerProfile.userId?._id || workerProfile.userId),
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = orderStats.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const servicePrices = (workerProfile.services || []).flatMap((service) => {
      if (service.typeofService === "range" && service.priceRange?.min) return [service.priceRange.min];
      if (typeof service.price === "number") return [service.price];
      return [];
    });

    const completedOrders = counts.completed || 0;
    const historicalOrders = completedOrders + (counts.cancelled || 0) + (counts.rejected || 0);
    const startingPrice =
      workerProfile.priceRange?.min ||
      (servicePrices.length > 0 ? Math.min(...servicePrices) : 0);

    const worker = workerProfile.toObject();
    worker.publicStats = {
      completedOrders,
      historicalOrders,
      successRate: historicalOrders > 0 ? Math.round((completedOrders / historicalOrders) * 100) : 0,
      startingPrice,
    };

    res.json({ worker });
  } catch (error) {
    console.error("getWorkerById error:", error);
    res.status(500).json({ message: "Server error fetching worker profile" });
  }
};

// ============================================================
// GET /api/workers/:id/reviews?page=1&limit=10
// ============================================================
// Fetches paginated reviews for a specific worker.
//
// IMPORTANT ID DISTINCTION:
//   - req.params.id = the WorkerProfile._id (used to find the profile)
//   - workerProfile.userId = the User._id (used to find reviews)
//
// Why the extra step? Because Review.workerId references the User model,
// NOT the WorkerProfile model. This is a common pattern:
//   - Reviews are tied to the PERSON (User._id) — they persist even if
//     the worker changes their profile or creates a new one.
//   - Services are tied to the PROFILE (WorkerProfile._id) — they belong
//     to a specific worker profile configuration.
//
// So we need to:
//   1. Find the WorkerProfile by its _id (from the URL)
//   2. Use workerProfile.userId to query the Review collection
// ============================================================
const getWorkerReviews = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    // Step 1: Find the worker profile to get the userId
    const workerProfile = await WorkerProfile.findById(req.params.id);
    if (!workerProfile) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const filter = { workerId: workerProfile.userId };
    const total = await Review.countDocuments(filter);

    const reviews = await Review.find(filter)
      .populate("customerId", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      reviews,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("getWorkerReviews error:", error);
    res.status(500).json({ message: "Server error fetching reviews" });
  }
};

// ============================================================
// GET /api/workers/service/:serviceId
// ============================================================
// Fetches a SINGLE approved+active WorkerService by its _id.
// Used by the /checkout page and by the chat service-seed prefill flow to
// show service summary info (name, price, worker) without loading the whole
// worker profile.
//
// Populates the worker chain: workerID (WorkerProfile) → userId (User) so the
// frontend can display the worker's name/avatar in the checkout summary.
// Category is populated so the coupon validator can check scope.
// ============================================================
const getServiceById = async (req, res) => {
  try {
    const service = await WorkerServices.findById(req.params.serviceId)
      .populate({
        path: "workerID",
        // Include ratingAverage + totalReviews + rank so the service detail
        // page can render trust signals (stars, count, rank badge) on the
        // worker card without a second round-trip.
        select: "userId verificationStatus ratingAverage totalReviews rank",
        populate: { path: "userId", select: "firstName lastName profileImage" },
      })
      .populate("categoryId", "name");

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    // Only expose services that are publicly orderable.
    if (!service.active || service.approvalStatus !== "approved") {
      return res.status(404).json({ message: "Service not available" });
    }

    res.json({ service });
  } catch (error) {
    console.error("getServiceById error:", error);
    res.status(500).json({ message: "Server error fetching service" });
  }
};

module.exports = { getWorkers, getWorkerById, getWorkerReviews, getServiceById };

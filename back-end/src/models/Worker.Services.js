const mongoose = require("mongoose");

const workerServicesSchema = new mongoose.Schema(
  {
    workerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
    },
    description: String,
    images: [{ type: String }], // URLs of images showcasing the service
    price: Number,
    typeofService: {
      type: String,
      enum: ["hourly", "fixed", "range"],
      default: "fixed",
    },
    time: Date,
    priceRange: {
      min: { type: Number },
      max: { type: Number },
      custom: { type: String },
    },
    active: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: String,
    teamNumber: Number,
  },
  { timestamps: true },
);

// Text index — enables Mongo's $text search across name + description, which
// the workers listing uses when the customer types a query. Mongo only allows
// ONE text index per collection; if you need to add more searchable fields
// later, drop this index and recreate it with the extended field list.
workerServicesSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("WorkerServices", workerServicesSchema);

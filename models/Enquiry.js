const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    company: {
      type: String,
      default: "Direct Client"
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      default: "N/A"
    },
    service: {
      type: String,
      default: "general"
    },
    serviceName: {
      type: String,
      default: "General Facility Inquiry"
    },
    scope: {
      type: String,
      default: "General site inquiry"
    },
    status: {
      type: String,
      enum: ["New", "In Progress", "Completed"],
      default: "New"
    },
    date: {
      type: String,
      default: () => new Date().toISOString().replace("T", " ").substring(0, 16)
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Enquiry", enquirySchema);

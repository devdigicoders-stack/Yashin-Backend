const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

let isMongoConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/yashin_db";
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2500
    });
    isMongoConnected = true;
    console.log(` Connected to MongoDB: ${uri}`);
  } catch (err) {
    isMongoConnected = false;
    console.warn(`⚠️ MongoDB connection failed (${err.message}). Using JSON file fallback.`);
  }
};

const getMongoStatus = () => isMongoConnected;

module.exports = {
  connectDB,
  getMongoStatus
};

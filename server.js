require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { connectDB, getMongoStatus } = require("./config/db");
const Admin = require("./models/Admin");
const Enquiry = require("./models/Enquiry");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "yashin_facilities_jwt_secret_key_2026";

// Connect to MongoDB
connectDB();

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, "enquiries.json");
const ADMIN_FILE = path.join(__dirname, "admin.json");

// Middleware to verify Admin JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. Please login first." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Session expired or invalid token. Please sign in again." });
    }
    req.user = user;
    next();
  });
}

// JSON Fallback Helpers
function getAdminsFromFile() {
  try {
    if (fs.existsSync(ADMIN_FILE)) {
      return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveAdminsToFile(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

function getEnquiriesFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveEnquiriesToFile(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -------------------- AUTH & PROFILE ROUTES --------------------

// 1. Admin Login
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    let admin = null;
    if (getMongoStatus()) {
      admin = await Admin.findOne({ username });
    }

    if (!admin) {
      const admins = getAdminsFromFile();
      admin = admins.find((a) => a.username.toLowerCase() === username.toLowerCase());
    }

    if (!admin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
      {
        id: admin._id || admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role || "Super Admin"
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      admin: {
        id: admin._id || admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role || "Super Admin"
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
});

// 2. Change Admin Password (JWT Protected)
app.post("/api/admin/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Both current password and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long" });
  }

  try {
    const adminUsername = req.user.username;
    let admin = null;

    if (getMongoStatus()) {
      admin = await Admin.findOne({ username: adminUsername });
    }

    const admins = getAdminsFromFile();
    const fileAdminIndex = admins.findIndex((a) => a.username.toLowerCase() === adminUsername.toLowerCase());

    const targetAdmin = admin || (fileAdminIndex !== -1 ? admins[fileAdminIndex] : null);

    if (!targetAdmin) {
      return res.status(404).json({ error: "Admin profile not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, targetAdmin.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password does not match. Please verify and try again." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    if (getMongoStatus() && admin) {
      admin.password = hashedPassword;
      await admin.save();
    }

    if (fileAdminIndex !== -1) {
      admins[fileAdminIndex].password = hashedPassword;
      saveAdminsToFile(admins);
    }

    res.json({ message: "Password updated successfully! Please sign in with your new password next time." });
  } catch (err) {
    res.status(500).json({ error: "Error changing password: " + err.message });
  }
});

// -------------------- ENQUIRIES ROUTES --------------------

app.get("/api/enquiries", async (req, res) => {
  try {
    let list = [];
    if (getMongoStatus()) {
      list = await Enquiry.find().sort({ createdAt: -1 }).lean();
    }
    if (list.length === 0) {
      list = getEnquiriesFromFile();
    }

    const { status, service, search, page = 1, limit = 6 } = req.query;

    let filtered = [...list];

    if (status && status !== "All") {
      filtered = filtered.filter((item) => item.status.toLowerCase() === status.toLowerCase());
    }

    if (service && service !== "All") {
      filtered = filtered.filter((item) => item.service.toLowerCase() === service.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name?.toLowerCase().includes(q) ||
          item.company?.toLowerCase().includes(q) ||
          item.phone?.includes(q) ||
          item.email?.toLowerCase().includes(q) ||
          item.id?.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginated = filtered.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)) || 1,
      data: paginated,
      stats: {
        totalCount: list.length,
        newCount: list.filter((x) => x.status === "New").length,
        inProgressCount: list.filter((x) => x.status === "In Progress").length,
        completedCount: list.filter((x) => x.status === "Completed").length
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Error fetching enquiries: " + err.message });
  }
});

app.post("/api/enquiries", async (req, res) => {
  const { name, company, phone, email, service, scope } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: "Name and Phone are required" });
  }

  const serviceNames = {
    mep: "MEP & Substation Works",
    fire: "Firefighting & Alarm Systems",
    civil: "Civil Works, Gypsum & Cladding",
    cleaning: "Commercial & Residential Cleaning",
    manpower: "Manpower Supply",
    utility: "Utility Infrastructure"
  };

  const newEnq = {
    id: "ENQ-" + Math.floor(1000 + Math.random() * 9000),
    name,
    company: company || "Direct Client",
    phone,
    email: email || "N/A",
    service: service || "general",
    serviceName: serviceNames[service] || "General Facility Inquiry",
    scope: scope || "General site inquiry",
    status: "New",
    date: new Date().toISOString().replace("T", " ").substring(0, 16)
  };

  try {
    if (getMongoStatus()) {
      await Enquiry.create(newEnq);
    }

    const list = getEnquiriesFromFile();
    list.unshift(newEnq);
    saveEnquiriesToFile(list);

    res.status(201).json({ message: "Enquiry submitted successfully", enquiry: newEnq });
  } catch (err) {
    res.status(500).json({ error: "Error saving enquiry: " + err.message });
  }
});

app.patch("/api/enquiries/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    let updated = null;
    if (getMongoStatus()) {
      updated = await Enquiry.findOneAndUpdate({ id }, { status }, { new: true }).lean();
    }

    const list = getEnquiriesFromFile();
    const index = list.findIndex((e) => e.id === id);
    if (index !== -1) {
      list[index].status = status;
      saveEnquiriesToFile(list);
      if (!updated) updated = list[index];
    }

    if (!updated) {
      return res.status(404).json({ error: "Enquiry not found" });
    }

    res.json({ message: "Status updated successfully", enquiry: updated });
  } catch (err) {
    res.status(500).json({ error: "Error updating status: " + err.message });
  }
});

app.delete("/api/enquiries/:id", async (req, res) => {
  const { id } = req.params;

  try {
    if (getMongoStatus()) {
      await Enquiry.findOneAndDelete({ id });
    }

    let list = getEnquiriesFromFile();
    const initialLength = list.length;
    list = list.filter((e) => e.id !== id);

    if (list.length === initialLength && !getMongoStatus()) {
      return res.status(404).json({ error: "Enquiry not found" });
    }

    saveEnquiriesToFile(list);
    res.json({ message: "Enquiry deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Error deleting enquiry: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(` Yashin FM Backend running on http://localhost:${PORT}`);
});

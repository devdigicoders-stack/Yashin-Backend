require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "yashin_facilities_jwt_secret_key_2026";

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

function getAdmins() {
  try {
    if (fs.existsSync(ADMIN_FILE)) {
      return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveAdmins(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

function getEnquiries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveEnquiries(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -------------------- AUTH & PROFILE ROUTES --------------------

// 1. Admin Login
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Please provide both username and password." });
  }

  const admins = getAdmins();
  const admin = admins.find(
    (a) =>
      a.username.toLowerCase() === username.trim().toLowerCase() ||
      a.email.toLowerCase() === username.trim().toLowerCase()
  );

  if (!admin) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({
    message: "Login successful",
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    }
  });
});

// 2. Change Password Route (Protected)
app.post("/api/admin/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required." });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }

  const admins = getAdmins();
  const adminIndex = admins.findIndex((a) => a.id === req.user.id || a.username === req.user.username);

  if (adminIndex === -1) {
    return res.status(404).json({ error: "Admin profile not found." });
  }

  const admin = admins[adminIndex];
  const isMatch = await bcrypt.compare(currentPassword, admin.password);

  if (!isMatch) {
    return res.status(400).json({ error: "Current password does not match. Please try again." });
  }

  // Hash new password and save
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  admins[adminIndex].password = hashedNewPassword;
  admins[adminIndex].updatedAt = new Date().toISOString();
  saveAdmins(admins);

  res.json({ message: "Password updated successfully. Please use your new password next time." });
});

// -------------------- ENQUIRIES ROUTES --------------------

app.get("/api/enquiries", (req, res) => {
  let list = getEnquiries();
  const { search, status, service, page = 1, limit = 5 } = req.query;

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.phone.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.company && e.company.toLowerCase().includes(q))
    );
  }

  if (status && status !== "All") {
    list = list.filter((e) => e.status === status);
  }

  if (service && service !== "All") {
    list = list.filter((e) => e.service === service);
  }

  const total = list.length;
  const p = parseInt(page);
  const l = parseInt(limit);
  const startIndex = (p - 1) * l;
  const paginated = list.slice(startIndex, startIndex + l);

  res.json({
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l),
    data: paginated,
    stats: {
      totalCount: getEnquiries().length,
      newCount: getEnquiries().filter((x) => x.status === "New").length,
      inProgressCount: getEnquiries().filter((x) => x.status === "In Progress").length,
      completedCount: getEnquiries().filter((x) => x.status === "Completed").length
    }
  });
});

app.post("/api/enquiries", (req, res) => {
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

  const list = getEnquiries();
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

  list.unshift(newEnq);
  saveEnquiries(list);
  res.status(201).json({ message: "Enquiry submitted successfully", enquiry: newEnq });
});

app.patch("/api/enquiries/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const list = getEnquiries();
  const index = list.findIndex((e) => e.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Enquiry not found" });
  }

  list[index].status = status;
  saveEnquiries(list);
  res.json({ message: "Status updated successfully", enquiry: list[index] });
});

app.delete("/api/enquiries/:id", (req, res) => {
  const { id } = req.params;
  let list = getEnquiries();
  const initialLength = list.length;
  list = list.filter((e) => e.id !== id);

  if (list.length === initialLength) {
    return res.status(404).json({ error: "Enquiry not found" });
  }

  saveEnquiries(list);
  res.json({ message: "Enquiry deleted successfully" });
});

app.listen(PORT, () => {
  console.log(`🚀 Yashin FM Backend running on http://localhost:${PORT}`);
});

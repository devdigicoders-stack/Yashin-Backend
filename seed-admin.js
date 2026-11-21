const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const hash = bcrypt.hashSync("admin123", 10);
const admins = [
  {
    id: "ADM-01",
    username: "admin",
    email: "admin@yashin.qa",
    password: hash,
    role: "Super Admin",
    createdAt: new Date().toISOString()
  }
];

fs.writeFileSync(path.join(__dirname, "admin.json"), JSON.stringify(admins, null, 2));
console.log("Default admin created successfully: admin / admin123");

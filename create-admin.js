const readline = require("readline");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const ADMIN_FILE = path.join(__dirname, "admin.json");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n==================================================");
console.log("   Yashin Facilities Management - Admin Creation");
console.log("==================================================\n");

rl.question("Enter Admin Username: ", (username) => {
  if (!username.trim()) {
    console.log("❌ Username cannot be empty.");
    rl.close();
    process.exit(1);
  }

  rl.question("Enter Admin Email: ", (email) => {
    if (!email.trim()) {
      console.log("❌ Email cannot be empty.");
      rl.close();
      process.exit(1);
    }

    rl.question("Enter Admin Password: ", async (password) => {
      if (!password.trim() || password.length < 6) {
        console.log("❌ Password must be at least 6 characters.");
        rl.close();
        process.exit(1);
      }

      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        let admins = [];

        if (fs.existsSync(ADMIN_FILE)) {
          const raw = fs.readFileSync(ADMIN_FILE, "utf8");
          admins = JSON.parse(raw);
        }

        // Check if username/email already exists
        const existing = admins.find(
          (a) => a.username.toLowerCase() === username.trim().toLowerCase() || a.email.toLowerCase() === email.trim().toLowerCase()
        );

        if (existing) {
          console.log(`\n⚠️  Admin with username or email already exists! Updating credentials.`);
          existing.username = username.trim();
          existing.email = email.trim();
          existing.password = hashedPassword;
          existing.updatedAt = new Date().toISOString();
        } else {
          admins.push({
            id: "ADM-" + Date.now(),
            username: username.trim(),
            email: email.trim(),
            password: hashedPassword,
            role: "Super Admin",
            createdAt: new Date().toISOString()
          });
        }

        fs.writeFileSync(ADMIN_FILE, JSON.stringify(admins, null, 2));
        console.log("\n==================================================");
        console.log("✅ Admin successfully created / saved in backend!");
        console.log(`👤 Username: ${username.trim()}`);
        console.log(`📧 Email:    ${email.trim()}`);
        console.log("🔑 Password: [PROTECTED & HASHED]");
        console.log("==================================================\n");
      } catch (err) {
        console.error("❌ Error creating admin:", err.message);
      } finally {
        rl.close();
      }
    });
  });
});

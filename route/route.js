import express from "express";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import bcrypt from "bcryptjs";

const router = express.Router();
const USERS_FILE = path.resolve(process.cwd(), "db/Users_Accounts_Information.csv");

// Utility to load users from CSV
function loadUsers() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(USERS_FILE)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

router.get("/", (req, res) => {
  res.send("Server is ready for serving.");
});

// Register route
router.post("/api/register", async (req, res) => {
  const { name, email, password, role, phone, address, secretCode } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "All required fields must be provided." });
  }

  try {
    let userExists = false;

    if (fs.existsSync(USERS_FILE)) {
      await new Promise((resolve, reject) => {
        fs.createReadStream(USERS_FILE)
          .pipe(csv())
          .on("data", (row) => {
            if (row.EMAIL && row.EMAIL.trim().toLowerCase() === email.toLowerCase()) {
              userExists = true;
            }
          })
          .on("end", resolve)
          .on("error", reject);
      });
    }

    if (userExists) {
      return res.status(409).json({ error: "User with this email already exists." });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const finalSecretCode = role.toLowerCase() === "administrator" ? secretCode : "0";
    const id = `${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 10)}`;

    const newRow = `${id},${name},${email},${passwordHash},${salt},${phone || ""},${
      address || ""
    },${role},${finalSecretCode}\n`;

    if (!fs.existsSync(USERS_FILE)) {
      const headers =
        "ID,NAME,EMAIL,PASSWORD_hash,SALT,PHONE,ADDRESS,ROLE,SECRET_CODE\n";
      fs.writeFileSync(USERS_FILE, headers, "utf8");
    }

    fs.appendFileSync(USERS_FILE, newRow, "utf8");

    res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Login route
router.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("📤 Backend received login request:", req.body);

    const users = await loadUsers();
    console.log("📂 Users loaded from CSV:", users.map((u) => u.EMAIL));

    const foundUser = users.find((u) => u.EMAIL === email);

    if (!foundUser) {
      console.log("❌ No user found with email:", email);
      return res.status(404).json({
        success: false,
        message: "No user found with this email.",
      });
    }

    console.log("✅ Found user:", foundUser.EMAIL);

    const passwordMatch = bcrypt.compareSync(password, foundUser.PASSWORD_hash);
    console.log("🔑 Password match result:", passwordMatch);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password.",
      });
    }

    // Remove sensitive fields
    const { PASSWORD_hash, SALT, ...safeUser } = foundUser;

    res.json({
      success: true,
      message: "Login successful.",
      user: safeUser,
    });
  } catch (error) {
    console.error("🔥 Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

// Password Reset route
router.post("/api/reset-password", async (req, res) => {
  const { email, newPassword, secretCode } = req.body;

  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Email and new password are required." });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex((u) => u.EMAIL === email);

    if (userIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "No user found with this email." });
    }

    const user = users[userIndex];

    // Only administrators require secretCode
    if (user.ROLE && user.ROLE.toLowerCase() === "administrator") {
      if (!secretCode || user.SECRET_CODE !== secretCode) {
        return res
          .status(403)
          .json({ success: false, message: "Invalid or missing secret code." });
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPassword, salt);

    // Update user fields
    user.PASSWORD_hash = passwordHash;
    user.SALT = salt;

    // Write all users back to CSV
    const headers = Object.keys(users[0]).join(",") + "\n";
    const rows = users
      .map((u) =>
        [
          u.ID,
          u.NAME,
          u.EMAIL,
          u.PASSWORD_hash,
          u.SALT,
          u.PHONE,
          u.ADDRESS,
          u.ROLE,
          u.SECRET_CODE,
        ].join(",")
      )
      .join("\n");

    fs.writeFileSync(USERS_FILE, headers + rows + "\n", "utf8");

    res.json({ success: true, message: "Password reset successful." });
  } catch (error) {
    console.error("Error resetting password:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});



export default router;

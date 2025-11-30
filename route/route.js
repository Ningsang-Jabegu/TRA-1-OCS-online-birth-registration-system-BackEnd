import express from "express";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import bcrypt from "bcryptjs";
import { title } from "process";

const router = express.Router();
const USERS_FILE = path.resolve(
  process.cwd(),
  "db/Users_Accounts_Information.csv"
);
const BIRTH_RECORDS_FILE = path.resolve(
  process.cwd(),
  "db/Birth_Records.csv"
);

// Helper: simple lock using a .lock file and retry
const acquireLock = async (filePath, retries = 20, delayMs = 100) => {
  const lockPath = `${filePath}.lock`;
  for (let i = 0; i < retries; i++) {
    try {
      // 'wx' - write, fail if exists
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid || process.pid));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      // If file exists, wait and retry
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Could not acquire file lock: ' + lockPath);
};

const releaseLock = async (filePath) => {
  const lockPath = `${filePath}.lock`;
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch (err) {
    console.warn('Failed to release lock', lockPath, err.message);
  }
};

const backupFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const backupsDir = path.resolve(process.cwd(), 'db', 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const base = path.basename(filePath);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.resolve(backupsDir, `${base}.${ts}.bak`);
    fs.copyFileSync(filePath, dest);
    return dest;
  } catch (err) {
    console.warn('Backup failed for', filePath, err.message);
    return null;
  }
};

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

// List users (returns non-sensitive user fields)
router.get('/api/users', async (req, res) => {
  try {
    if (!fs.existsSync(USERS_FILE)) return res.json({ success: true, users: [] });
    const users = await loadUsers();
    const mapped = users.map(u => {
      const { PASSWORD_hash, SALT, ...safe } = u;
      // normalize keys to common shape
      return {
        id: safe.ID || safe.id || '',
        name: safe.NAME || safe.name || '',
        email: safe.EMAIL || safe.email || '',
        phone: safe.PHONE || safe.phone || '',
        address: safe.ADDRESS || safe.address || '',
        role: safe.ROLE || safe.role || '',
        secretCode: safe.SECRET_CODE || safe.secretCode || '',
        raw: safe
      };
    });
    res.json({ success: true, users: mapped });
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Fetch single user by ID or email
router.get('/api/user/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  try {
    if (!fs.existsSync(USERS_FILE)) return res.status(404).json({ success: false, message: 'Users file not found' });
    const users = await loadUsers();
    const found = users.find(u => (u.ID && u.ID === identifier) || (u.id && u.id === identifier) || (u.EMAIL && u.EMAIL.toLowerCase() === identifier.toLowerCase()) || (u.email && u.email.toLowerCase() === identifier.toLowerCase()));
    if (!found) return res.status(404).json({ success: false, message: 'User not found' });

    const { PASSWORD_hash, SALT, ...safe } = found;
    // Normalize keys
    const mapped = {
      id: safe.ID || safe.id || '',
      name: safe.NAME || safe.name || '',
      email: safe.EMAIL || safe.email || '',
      phone: safe.PHONE || safe.phone || '',
      address: safe.ADDRESS || safe.address || '',
      role: safe.ROLE || safe.role || '',
      registeredAt: safe.REGISTERED_AT || safe.registeredAt || '',
      raw: safe
    };

    res.json({ success: true, user: mapped });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.get("/", (req, res) => {
  res.send("Server is ready for serving.");
});

// Register route
router.post("/api/register", async (req, res) => {
  const { name, email, password, role, phone, address, secretCode } = req.body;

  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ error: "All required fields must be provided." });
  }

  try {
    let userExists = false;

    if (fs.existsSync(USERS_FILE)) {
      await new Promise((resolve, reject) => {
        fs.createReadStream(USERS_FILE)
          .pipe(csv())
          .on("data", (row) => {
            if (
              row.EMAIL &&
              row.EMAIL.trim().toLowerCase() === email.toLowerCase()
            ) {
              userExists = true;
            }
          })
          .on("end", resolve)
          .on("error", reject);
      });
    }

    if (userExists) {
      return res
        .status(409)
        .json({ error: "User with this email already exists." });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const finalSecretCode =
      role.toLowerCase() === "administrator" ? secretCode : "0";
    const id = `${role.toLowerCase()}-${Date.now()}-${Math.floor(
      Math.random() * 10
    )}`;

    const quote = (v) => {
      if (v === null || typeof v === 'undefined') return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const newRowValues = [
      id,
      name,
      email,
      passwordHash,
      salt,
      phone || '',
      address || '',
      role,
      finalSecretCode
    ];
    const newRow = newRowValues.map(quote).join(',') + '\n';

    if (!fs.existsSync(USERS_FILE)) {
      const headers =
        "ID,NAME,EMAIL,PASSWORD_hash,SALT,PHONE,ADDRESS,ROLE,SECRET_CODE\n";
      fs.writeFileSync(USERS_FILE, headers, "utf8");
    }

    // Append new user safely using file lock and backup
    try {
      await acquireLock(USERS_FILE);
      backupFile(USERS_FILE);
      fs.appendFileSync(USERS_FILE, newRow, "utf8");
    } finally {
      await releaseLock(USERS_FILE);
    }

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
    // console.log("📤 Backend received login request:", req.body);

    const users = await loadUsers();
    // Loads all the email of user
    // console.log(
    //   "📂 Users loaded from CSV:",
    //   users.map((u) => u.EMAIL)
    // );

    const foundUser = users.find((u) => u.EMAIL === email);

    if (!foundUser) {
      // console.log("❌ No user found with email:", email);
      return res.status(404).json({
        success: false,
        message: `No user found with this email (${email}).`,
      });
    }

    // console.log("✅ Found user:", foundUser.EMAIL);

    const passwordMatch = bcrypt.compareSync(password, foundUser.PASSWORD_hash);
    // console.log("🔑 Password match result:", passwordMatch);

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
  const { email, newPassword, role, secretCode } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: {
        title: "",
        description: "Email is required.",
      },
    });
  }
  if (!role) {
    return res.status(400).json({
      success: false,
      message: {
        title: "",
        description: "Role is required.",
      },
    });
  }
  if (!newPassword) {
    return res.status(400).json({
      success: false,
      message: {
        title: "",
        description: "New password is required.",
      },
    });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex((u) => u.EMAIL === email);
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: {
          title: "",
          description: `No user found with the email: ${email}`,
        },
      });
    }
    const user = users[userIndex];
    // Enforce role match
    if (!user.ROLE) {
      return res.status(403).json({
        success: false,
        message: {
          title: "",
          description: `No role found for user with email: ${email}`,
        },
      });
    }
    if (user.ROLE.toLowerCase() !== role.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: {
          title: "",
          description: `Role mismatch: user with email ${email} is registered as ${user.ROLE}, not ${role}.`,
        },
      });
    }
    // Only administrators require secretCode
    if (user.ROLE.toLowerCase() === "administrator") {
      if (!secretCode) {
        return res.status(403).json({
          success: false,
          message: {
            title: "",
            description:
              "Secret code is required for administrator password reset.",
          },
        });
      }
      if (user.SECRET_CODE !== secretCode) {
        return res.status(403).json({
          success: false,
          message: {
            title: "",
            description: "Incorrect secret code for administrator.",
          },
        });
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPassword, salt);

    // Update user fields
    user.PASSWORD_hash = passwordHash;
    user.SALT = salt;

    // Write all users back to CSV
    // Build CSV text safely with quoted fields (preserve header order)
    const keys = Object.keys(users[0]);
    const headers = keys.join(',') + '\n';
    const quote = (v) => {
      if (v === null || typeof v === 'undefined') return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const rows = users.map(u => keys.map(k => quote(u[k])).join(',')).join('\n') + '\n';

    // write safely with lock and backup
    try {
      await acquireLock(USERS_FILE);
      backupFile(USERS_FILE);
      fs.writeFileSync(USERS_FILE, headers + rows, 'utf8');
    } finally {
      await releaseLock(USERS_FILE);
    }

    res.json({
      success: true,
      message: {
        title: "",
        description: "Password reset successful.",
      },
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      success: false,
      message: {
        title: "",
        description: `Internal Server Error: ${
          error && error.message ? error.message : error
        }`,
      },
    });
  }
});

// Update Profile route
router.post("/api/update-profile", async (req, res) => {
  const { id, name, email, phone, address } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: { title: "", description: "User ID is required." } });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex((u) => u.ID === id || u.EMAIL === email);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: { title: "", description: `No user found with the provided identifier.` } });
    }

    const user = users[userIndex];

    // Check if any changes
    const changes = {};
    if (name && name !== user.NAME) changes.NAME = name;
    if (email && email !== user.EMAIL) changes.EMAIL = email;
    if (typeof phone !== 'undefined' && phone !== user.PHONE) changes.PHONE = phone;
    if (typeof address !== 'undefined' && address !== user.ADDRESS) changes.ADDRESS = address;

    if (Object.keys(changes).length === 0) {
      return res.json({ success: false, message: { title: "No changes", description: "No changes made." } });
    }

    // Apply changes
    users[userIndex] = { ...user, ...changes };

    // Write back CSV (preserve header order)
    // Build CSV text safely with quoted fields (preserve header order)
    const keys = Object.keys(users[0]);
    const headers = keys.join(',') + '\n';
    const quote = (v) => {
      if (v === null || typeof v === 'undefined') return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const rows = users.map(u => keys.map(k => quote(u[k])).join(',')).join('\n') + '\n';

    // safe write with lock and backup
    try {
      await acquireLock(USERS_FILE);
      backupFile(USERS_FILE);
      fs.writeFileSync(USERS_FILE, headers + rows, 'utf8');
    } finally {
      await releaseLock(USERS_FILE);
    }

    // Return updated user (without sensitive fields)
    const { PASSWORD_hash, SALT, ...safeUser } = users[userIndex];
    res.json({ success: true, message: { title: "Profile Updated", description: "Profile updated successfully." }, user: safeUser });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, message: { title: "", description: "Internal Server Error" } });
  }
});

export default router;

// Register birth route
router.post('/api/register-birth', async (req, res) => {
  const payload = req.body || {};
  // expected fields (many): certificateNo, childFirstName, childMiddleName, childLastName, gender, dateOfBirth, nepaliDOB, placeOfBirth, province, district, municipality, ward,
  // fatherFirstName, fatherMiddleName, fatherLastName, fatherCitizenshipNo,
  // motherFirstName, motherMiddleName, motherLastName, motherCitizenshipNo,
  // permanentAddress, contactNumber, remarks, registeredBy
  try {
    // create file with header if doesn't exist
    if (!fs.existsSync(BIRTH_RECORDS_FILE)) {
      const headers = [
        'ID',
        'CERTIFICATE_NO',
        'CHILD_FIRST_NAME',
        'CHILD_MIDDLE_NAME',
        'CHILD_LAST_NAME',
        'GENDER',
        'DATE_OF_BIRTH',
        'NEPALI_DOB',
        'PLACE_OF_BIRTH',
        'PROVINCE',
        'DISTRICT',
        'MUNICIPALITY',
        'WARD',
        'FATHER_FIRST_NAME',
        'FATHER_MIDDLE_NAME',
        'FATHER_LAST_NAME',
        'FATHER_CITIZENSHIP_NO',
        'MOTHER_FIRST_NAME',
        'MOTHER_MIDDLE_NAME',
        'MOTHER_LAST_NAME',
        'MOTHER_CITIZENSHIP_NO',
        'PERMANENT_ADDRESS',
        'CONTACT_NUMBER',
        'REMARKS',
    'REGISTERED_BY',
    'REGISTERED_AT',
    'REJECT_REASON'
      ].join(',') + '\n';
      fs.writeFileSync(BIRTH_RECORDS_FILE, headers, 'utf8');
    }

    // Build a CSV-safe row (quote fields that may contain commas)
    const quote = (v) => {
      if (v === null || typeof v === 'undefined') return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    // generate ID if not provided
    const id = payload.id || `BR-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const certificateNo = payload.certificateNo || `BC-${new Date().getFullYear()}-${Math.floor(Math.random()*100000)}`;
    const registeredAt = new Date().toISOString();

    const rowFields = [
      id,
      certificateNo,
      payload.childFirstName || '',
      payload.childMiddleName || '',
      payload.childLastName || '',
      payload.gender || '',
      payload.dateOfBirth || '',
      payload.nepaliDOB || '',
      payload.placeOfBirth || '',
      payload.province || '',
      payload.district || '',
      payload.municipality || '',
      payload.ward || '',
      payload.fatherFirstName || '',
      payload.fatherMiddleName || '',
      payload.fatherLastName || '',
      payload.fatherCitizenshipNo || '',
      payload.motherFirstName || '',
      payload.motherMiddleName || '',
      payload.motherLastName || '',
      payload.motherCitizenshipNo || '',
      payload.permanentAddress || '',
      payload.contactNumber || '',
      payload.remarks || '',
      payload.registeredBy || '',
      registeredAt,
      '' // REJECT_REASON (empty on creation)
    ].map(quote).join(',') + '\n';

    // Acquire lock, backup and append safely
    try {
      await acquireLock(BIRTH_RECORDS_FILE);
      backupFile(BIRTH_RECORDS_FILE);
      fs.appendFileSync(BIRTH_RECORDS_FILE, rowFields, 'utf8');
    } finally {
      await releaseLock(BIRTH_RECORDS_FILE);
    }

    res.status(201).json({ success: true, message: 'Birth record registered.', id, certificateNo });
  } catch (err) {
    console.error('Error registering birth:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Update birth record status (approve/reject)
router.post('/api/birth-record/:identifier/status', async (req, res) => {
  const identifier = req.params.identifier;
  const { status, reason } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

  try {
    if (!fs.existsSync(BIRTH_RECORDS_FILE)) {
      return res.status(404).json({ success: false, message: 'No records file found' });
    }

    // Read csv into array
    const results = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(BIRTH_RECORDS_FILE)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const idx = results.findIndex(r => r.CERTIFICATE_NO === identifier || r.ID === identifier);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Record not found' });

    results[idx].STATUS = status;
    // Ensure REJECT_REASON exists on each record and set for this record
    results.forEach(r => { if (typeof r.REJECT_REASON === 'undefined') r.REJECT_REASON = ''; });
    results[idx].REJECT_REASON = status === 'rejected' ? (reason || '') : '';

    // Build CSV text preserving header order
  let keys = Object.keys(results[0]);
  if (!keys.includes('REJECT_REASON')) keys.push('REJECT_REASON');
  const headers = keys.join(',') + '\n';

    const quote = (v) => {
      if (v === null || typeof v === 'undefined') return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

  const rows = results.map(r => keys.map(k => quote(r[k])).join(',')).join('\n') + '\n';

    // Write safely with lock and backup
    try {
      await acquireLock(BIRTH_RECORDS_FILE);
      backupFile(BIRTH_RECORDS_FILE);
      fs.writeFileSync(BIRTH_RECORDS_FILE, headers + rows, 'utf8');
    } finally {
      await releaseLock(BIRTH_RECORDS_FILE);
    }

    res.json({ success: true, message: 'Status updated', record: results[idx] });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Fetch birth record by certificate no or id
router.get('/api/birth-record/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  try {
    if (!fs.existsSync(BIRTH_RECORDS_FILE)) {
      return res.status(404).json({ success: false, message: 'No records found' });
    }
    const results = [];
    fs.createReadStream(BIRTH_RECORDS_FILE)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        const found = results.find(r => r.CERTIFICATE_NO === identifier || r.ID === identifier);
        if (!found) return res.status(404).json({ success: false, message: 'Record not found' });
        // Normalize and surface commonly-needed fields for the certificate
        const combineName = (first, middle, last) => [first, middle, last].filter(Boolean).join(' ').trim();
        const fatherName = combineName(found.FATHER_FIRST_NAME, found.FATHER_MIDDLE_NAME, found.FATHER_LAST_NAME) || (found.FATHER || '');
        const motherName = combineName(found.MOTHER_FIRST_NAME, found.MOTHER_MIDDLE_NAME, found.MOTHER_LAST_NAME) || (found.MOTHER || '');
        const informantName = found.INFORMANT_NAME || found.REGISTERED_BY || found.REPORTER || '';
        const wardNo = found.WARD || found.WARD_NO || found.WARDNO || '';
        const municipality = found.MUNICIPALITY || found.MUNICIPALITY_NAME || found.LOCAL_BODY || '';
        const dobBS = found.NEPALI_DOB || found.NEPALI_DATE || found.NEPALI_DOBBS || '';
        const dobAD = found.DATE_OF_BIRTH || found.DOB || found.BIRTH_DATE || '';
        const placeOfBirth = found.PLACE_OF_BIRTH || found.PLACE || found.BIRTH_PLACE || '';

        const normalized = {
          id: found.ID,
          certificateNo: found.CERTIFICATE_NO,
          childFirstName: found.CHILD_FIRST_NAME || found.FIRST_NAME || '',
          childMiddleName: found.CHILD_MIDDLE_NAME || '',
          childLastName: found.CHILD_LAST_NAME || found.LAST_NAME || '',
          childFullName: combineName(found.CHILD_FIRST_NAME, found.CHILD_MIDDLE_NAME, found.CHILD_LAST_NAME) || found.CHILD_NAME || '',
          gender: found.GENDER || '',
          dobAD,
          dobBS,
          placeOfBirth,
          province: found.PROVINCE || '',
          district: found.DISTRICT || '',
          municipality,
          wardNo,
          fatherName,
          motherName,
          fatherCitizenshipNo: found.FATHER_CITIZENSHIP_NO || found.FATHER_CIT_NO || '',
          motherCitizenshipNo: found.MOTHER_CITIZENSHIP_NO || found.MOTHER_CIT_NO || '',
          permanentAddress: found.PERMANENT_ADDRESS || found.ADDRESS || '',
          contactNumber: found.CONTACT_NUMBER || found.PHONE || '',
          remarks: found.REMARKS || '',
          registeredBy: found.REGISTERED_BY || '',
          registeredAt: found.REGISTERED_AT || '',
          status: found.STATUS || 'pending',
          rejectReason: found.REJECT_REASON || '',
          raw: found
        };

        res.json({ success: true, record: normalized });
      })
      .on('error', (err) => {
        console.error('Error reading birth records:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
      });
  } catch (err) {
    console.error('Error fetching birth record:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Utility: Levenshtein distance and similarity (normalized)
function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const matrix = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) matrix[i][0] = i;
  for (let j = 0; j <= bl; j++) matrix[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[al][bl];
}

function similarity(a, b) {
  a = (a || '').toString().trim().toLowerCase();
  b = (b || '').toString().trim().toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : Math.max(0, 1 - dist / maxLen);
}

// Search birth records with fuzzy name matching and optional DOB filter
router.get('/api/birth-record/search', async (req, res) => {
  try {
    const qName = (req.query.name || '').toString().trim();
    const qDob = (req.query.dob || '').toString().trim();
    if (!fs.existsSync(BIRTH_RECORDS_FILE)) return res.json({ success: true, matches: [] });

    const results = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(BIRTH_RECORDS_FILE)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    // Score each record by name similarity and DOB match
    const scored = results.map(r => {
      const candidateName = [r.CHILD_FIRST_NAME, r.CHILD_MIDDLE_NAME, r.CHILD_LAST_NAME].filter(Boolean).join(' ').trim() || r.CHILD_NAME || '';
      const nameSim = qName ? similarity(qName, candidateName.split(' ').pop() || candidateName) : 0; // compare query to last name if provided
      const fullNameSim = qName ? similarity(qName, candidateName) : 0;
      const dobRaw = (r.DATE_OF_BIRTH || '').toString().slice(0,10);
      const dobMatch = qDob ? (dobRaw === qDob ? 1 : 0) : 0;
      // combine: prefer exact DOB match, but weigh name similarity heavily
      const score = Math.max(fullNameSim * 0.8 + dobMatch * 0.2, nameSim * 0.9 + dobMatch * 0.1);
      return { record: r, score };
    });

    const filtered = scored.filter(s => s.score > 0.45).sort((a,b) => b.score - a.score).slice(0, 10);
    res.json({ success: true, matches: filtered.map(f => ({ score: f.score, record: f.record })) });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// List birth records (tries CSV, falls back to mock JSON)
router.get('/api/birth-records', async (req, res) => {
  try {
    if (fs.existsSync(BIRTH_RECORDS_FILE)) {
      const results = [];
      fs.createReadStream(BIRTH_RECORDS_FILE)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          // Map records: add STATUS and CERTIFICATE_URL if present
          const combineName = (first, middle, last) => [first, middle, last].filter(Boolean).join(' ').trim();
          const mapped = results.map(r => ({
            id: r.ID,
            certificateNo: r.CERTIFICATE_NO,
            childFirstName: r.CHILD_FIRST_NAME,
            childMiddleName: r.CHILD_MIDDLE_NAME,
            childLastName: r.CHILD_LAST_NAME,
            childFullName: combineName(r.CHILD_FIRST_NAME, r.CHILD_MIDDLE_NAME, r.CHILD_LAST_NAME) || r.CHILD_NAME || '',
            gender: r.GENDER,
            dateOfBirth: r.DATE_OF_BIRTH,
            dobBS: r.NEPALI_DOB || r.NEPALI_DATE || '',
            placeOfBirth: r.PLACE_OF_BIRTH || r.PLACE || '',
            municipality: r.MUNICIPALITY || r.MUNICIPALITY_NAME || '',
            wardNo: r.WARD || r.WARD_NO || r.WARDNO || '',
            fatherName: combineName(r.FATHER_FIRST_NAME, r.FATHER_MIDDLE_NAME, r.FATHER_LAST_NAME) || r.FATHER || '',
            motherName: combineName(r.MOTHER_FIRST_NAME, r.MOTHER_MIDDLE_NAME, r.MOTHER_LAST_NAME) || r.MOTHER || '',
            status: r.STATUS || 'pending',
            certificateUrl: r.CERTIFICATE_NO ? `/certificate/${r.CERTIFICATE_NO}` : (r.CERTIFICATE_URL || ''),
            raw: r
          }));
          res.json({ success: true, records: mapped });
        })
        .on('error', (err) => {
          console.error('Error reading birth records:', err);
          res.status(500).json({ success: false, message: 'Internal Server Error' });
        });
    } else {
      // read mock JSON
      const mockPath = path.resolve(process.cwd(), 'db/mock_birth_records.json');
      if (fs.existsSync(mockPath)) {
        const raw = fs.readFileSync(mockPath, 'utf8');
        const arr = JSON.parse(raw);
        const mapped = arr.map(r => ({
          id: r.ID,
          certificateNo: r.CERTIFICATE_NO,
          childFirstName: r.CHILD_FIRST_NAME,
          childMiddleName: r.CHILD_MIDDLE_NAME,
          childLastName: r.CHILD_LAST_NAME,
          gender: r.GENDER,
          dateOfBirth: r.DATE_OF_BIRTH,
          status: r.STATUS || 'pending',
          certificateUrl: r.CERTIFICATE_URL || (r.CERTIFICATE_NO ? `/certificate/${r.CERTIFICATE_NO}` : ''),
          raw: r
        }));
        res.json({ success: true, records: mapped });
      } else {
        res.json({ success: true, records: [] });
      }
    }
  } catch (err) {
    console.error('Error listing birth records:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});


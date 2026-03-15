const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

/**
 * register — creates a new user account
 * Hashes password (via User model pre-save hook), saves to DB, returns JWT.
 */
async function register(req, res) {
  try {
    const { name, email, password, role } = req.body;

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Create user (password is hashed in pre-save hook)
    const user = await User.create({ name, email, password, role });

    // Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ User registered: ${user.email} (${user.role})`);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id, // backward-compatible
          _id: user._id, // preferred for frontend socket payloads
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error('❌ Register error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * login — authenticates user and returns JWT + user data
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ User logged in: ${user.email}`);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * quickAccess — no-password entry for teacher/student classroom flow.
 * Creates user if needed, otherwise reuses existing matching role and returns JWT.
 */
async function quickAccess(req, res) {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ success: false, message: 'name, email and role are required' });
    }

    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Only teacher and student roles are supported' });
    }

    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user && user.role !== role) {
      return res.status(400).json({
        success: false,
        message: `This email is already registered as ${user.role}. Use a different email for ${role}.`,
      });
    }

    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        password: tempPassword,
      });
      console.log(`✅ Quick access user created: ${user.email} (${user.role})`);
    } else if (user.name !== name.trim()) {
      user.name = name.trim();
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error('❌ Quick access error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { register, login, quickAccess };

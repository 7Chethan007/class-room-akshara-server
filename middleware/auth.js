const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * auth — JWT verification middleware
 * Extracts token from Authorization header, verifies it,
 * and attaches the user object to req.user.
 */
async function auth(req, res, next) {
  try {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = header.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

/**
 * authorize — role-based access control
 * Usage: router.post('/create', auth, authorize('teacher'), controller)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized`,
      });
    }
    next();
  };
}

module.exports = { auth, authorize };

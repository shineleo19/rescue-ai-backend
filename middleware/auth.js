const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  try {
    // 1. Get the token from the header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Attach the user payload to the request object
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

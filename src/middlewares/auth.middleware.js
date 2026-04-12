module.exports = (req, res, next) => {
  if (!req.user) {
    req.user = {
      id: req.headers['x-user-id'] || null,
      pseudo_id: req.headers['x-user-pseudo-id'] || null,
      role: req.headers['x-user-role'] || null,
    };
  }

  next();
};

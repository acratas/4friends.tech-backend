let express = require('express');
const path = require("path");
let router = express.Router();

let dbInstance;

/* GET home page. */
router.get(['/', '/list/users', '/list/blyc', '/army/*', '/club/*', '/util/*'], function(req, res, next) {
  console.log(`[${req.method}] ${req.originalUrl}`);
  res.sendFile(path.resolve(__dirname + '/../public/index.html'));
});

module.exports = (_dbInstance) => {
  dbInstance = _dbInstance;
  return router;
}

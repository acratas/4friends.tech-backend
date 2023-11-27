const axios = require('axios');

const captchaMiddleware = (secretKey) => async (req, res, next) => {
  const captchaToken = req.headers["x-captcha-token"];

  if (!captchaToken) {
    return res.status(400).json({ error: 'Captcha token is missing.' });
  }

  const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaToken}`;

  try {
    const response = await axios.post(verificationURL);
    const body = response.data;

    if (body.success) {
      next();
    } else {
      res.status(401).json({ error: 'Captcha verification failed.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error verifying captcha.' });
  }
};

module.exports = captchaMiddleware;

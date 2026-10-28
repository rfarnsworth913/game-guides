require('dotenv').config();
module.exports = {
    '/api/**': { target: `http://127.0.0.1:${process.env.MIDDLEWARE_PORT || 3001}`, secure: false },
};

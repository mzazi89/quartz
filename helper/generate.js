const crypto = require('crypto');

const generateSessionId = () => {
  return crypto.randomBytes(16).toString('hex');
};

const generateDeviceId = () => {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
};

const formatPairingCode = (code) => {
  return code?.match(/.{1,4}/g)?.join("-") || code;
};

const validatePhoneNumber = (number) => {
  number = number.replace(/[^0-9]/g, '');
  if (number.length < 10 || number.length > 15) {
    return null;
  }
  return number;
};

const generateRandomString = (length = 16) => {
  return crypto.randomBytes(length).toString('hex');
};

module.exports = {
  generateSessionId,
  generateDeviceId,
  formatPairingCode,
  validatePhoneNumber,
  generateRandomString
};

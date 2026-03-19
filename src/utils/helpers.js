// src/utils/helpers.js

// Generate order reference: ADE-YYYYMMDD-XXXX
const generateOrderRef = () => {
  const date   = new Date();
  const ymd    = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand   = Math.floor(1000 + Math.random() * 9000);
  return `ADE-${ymd}-${rand}`;
};

// Generate shipment reference: SHP-YYYYMMDD-XXX
const generateShipmentRef = () => {
  const date = new Date();
  const ymd  = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(100 + Math.random() * 900);
  return `SHP-${ymd}-${rand}`;
};

// Slugify product name → url-safe slug
const slugify = (str) =>
  str.toLowerCase()
     .replace(/[^a-z0-9 -]/g, '')
     .replace(/\s+/g, '-')
     .replace(/-+/g, '-')
     .trim();

// Format NGN currency
const formatNGN = (amount) =>
  `₦${Number(amount).toLocaleString('en-NG')}`;

// Paginate helper
const paginate = (page = 1, limit = 20) => ({
  skip: (parseInt(page) - 1) * parseInt(limit),
  take: parseInt(limit),
});

module.exports = { generateOrderRef, generateShipmentRef, slugify, formatNGN, paginate };

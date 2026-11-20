// تحميل وحدات src في Node بنفس ترتيب تحميلها داخل الإضافة
globalThis.Countries = require('../src/countries.js');
module.exports = {
  AI: require('../src/ai.js'),
  HS: require('../src/analysis.js'),
  Countries: globalThis.Countries
};

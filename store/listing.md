# Chrome Web Store listing

**Name:** Nazeel | نزيل
**Summary (≤132):** إحصائيات نزلاء الفندق + مساعد إدخال ذكي يقرأ الهوية والجواز والتأشيرة ويعبّي الاستمارة للمراجعة.
**Category:** Productivity

## Description (AR)
نزيل تساعد موظف الاستقبال على تحليل بيانات النزلاء وإدخالها بسرعة ودقة.
• إحصائيات فورية: الجدد/القدامى، العراقيون/الأجانب، الجنسيات، الغرف والطوابق.
• مساعد إدخال ذكي: يقرأ الهوية والجواز والتأشيرة من أي دولة ويعبّي الاستمارة للمراجعة.
• خصوصية أولاً: قراءة محلية عبر Ollama، وGemini اختياري.
• تقارير: نسخ للواتساب، تصدير CSV، تقرير قابل للطباعة.

## Single purpose statement
Assist hotel staff by analyzing the guest list page and pre-filling the guest registration form from document images.

## Permission justifications
- activeTab/scripting: read guest table and fill form on user action.
- storage: save settings and analysis locally.
- sidePanel: show the entry assistant.
- declarativeNetRequest: strip Origin header for local Ollama requests.
- Host access: localhost Ollama; Gemini API (optional).
- optional_host_permissions (http/https): requested at runtime, for ONE origin only, when the user clicks "Enable on this site" in the side panel. Used to register the content script that pre-fills the hotel's guest form. The user can revoke it at any time.

## Privacy practices
Handles personal data (names, ID images). Not sold, not used for unrelated purposes. See PRIVACY.md.

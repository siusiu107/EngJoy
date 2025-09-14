# EngJoy — Static Frontend MVP (Firebase RTDB + Auth)

This project is a static, multi-page frontend for the EngJoy product. It uses Firebase for Authentication, Realtime Database and Storage.

## What's included
- Pages: index, placement, auth (login/signup), dashboard, courses list/detail, lesson player, admin CMS
- Simple Tailwind-based responsive design
- Firebase (modular SDK v9) integration in `assets/js/main.js`
- CMS page to seed sample courses into the Realtime Database
- Recorder UI that uploads audio to Firebase Storage and records submission metadata to RTDB

## How to run
1. Ensure you have a Firebase project with:
   - Authentication (Email/Password enabled)
   - Realtime Database (set to test mode or configure rules)
   - Storage (optional for audio uploads)
2. Place the project folder on a simple static server or open `index.html` in a browser.
   - For local testing with modules, a local static server is recommended (e.g. `npx http-server` or `python -m http.server`).
3. The project uses the firebase config in `assets/js/firebase-config.js`. Replace it if you want to use your own.
4. From the Firebase Console, for Realtime Database set rules to allow read/write for logged-in users during testing:
```
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```
5. Open `/admin/cms.html` and click "Seed sample data" to add example courses.

## Notes & cautions
- This is a frontend MVP. For production, secure your database rules, enable proper CORS, and restrict write access.
- Analytics may not initialize correctly on localhost.
- iOS Safari has limitations for MediaRecorder; testing on desktop Chrome is recommended.


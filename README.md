# CleanCity

A community garbage-reporting app with a React/Vite frontend, FastAPI backend, and SQL Server storage. Residents can submit an image, description, location, and observation date/time without creating an account. Contact information is optional and only included in authenticated admin responses.

## Requirements

- Node.js 18 or newer
- Python 3.10 or newer
- SQL Server, with an empty database created for the app
- Microsoft ODBC Driver 18 for SQL Server installed on the API host

## Run locally

1. Create a SQL Server database (default name: `CityGarbage`).
2. Copy `backend/.env.example` to `backend/.env`, then set the SQL Server host, database, credentials, and your admin user ID and unique password (at least 12 characters). Use Windows Authentication by leaving `SQL_USERNAME` empty and configuring the host process for trusted connections.
3. Start the API from the repository root:

   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

   The API creates the `dbo.GarbageReports` table and its index on startup. Uploaded images are stored in `backend/uploads` by default; set `UPLOAD_DIR` to durable storage in production.
4. In a second terminal, install and run the frontend:

   ```powershell
   npm install
   npm run dev
   ```

5. Open the Vite URL printed in the terminal. The Vite development server proxies `/api` and `/uploads` to the local API. Sign in to the Admin panel with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured in `backend/.env`.

### Seed local demo reports

With the backend virtual environment installed and the SQL Server settings in `backend/.env` configured, run this from the repository root to add 2,000 clearly marked sample reports:

```powershell
Set-Location backend
.\.venv\Scripts\python.exe seed_demo.py --count 2000
```

The seeder refuses to insert duplicates if `[DEMO]` reports already exist. Demo residents use reserved `example.com` addresses, the sample image is labeled as a demo, and the admin dashboard shows 50 reports per page.

After signing in, the admin workspace opens at `/admin`. Use its sidebar to switch between the full-page report desk and `/admin/analytics`, which summarizes monthly report volume, status breakdown, resolution rate, resident contact availability, and the most reported areas.

## Production notes

- Set a unique `ADMIN_USERNAME` and strong `ADMIN_PASSWORD` (at least 12 characters). Admin login returns a signed bearer session that expires after eight hours; protected endpoints reject invalid or expired sessions. Serve the admin panel only over HTTPS and restrict its audience at the network or identity-provider layer as appropriate.
- Set `CORS_ORIGINS` to the exact frontend origin(s), separated by commas. Configure the production web server to proxy `/api` and `/uploads` to FastAPI, or set up an equivalent same-origin route.
- Use a SQL Server account with access only to the application's database. Keep credentials and the admin token out of source control.
- Put `UPLOAD_DIR` on durable storage and back up the database and image directory together. The API accepts JPEG, PNG, or WEBP images up to 8 MB and checks that the file contents match the declared image type.
- Public report responses omit reporter contact information; the admin report endpoint returns it only after bearer-token authentication.

## API overview

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Database connectivity check |
| `GET` | `/api/reports` | Public | Latest 100 reports, without contact details |
| `POST` | `/api/reports` | Public | Submit a multipart report and image |
| `GET` | `/api/admin/reports` | Admin token | List reports, including optional contact details |
| `PATCH` | `/api/admin/reports/{id}` | Admin token | Change a report status |
| `DELETE` | `/api/admin/reports/{id}` | Admin token | Delete a report and its uploaded image |

Admin sign-in uses `POST /api/admin/login` with a JSON username and password; successful sign-in returns an eight-hour bearer session. The frontend keeps that session for the browser tab and never stores the password. Admin requests use `Authorization: Bearer <session>`. Allowed statuses are `Reported`, `In progress`, and `Resolved`.
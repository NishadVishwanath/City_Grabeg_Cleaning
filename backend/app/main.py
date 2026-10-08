import hmac
import io
import json
import os
import re
import uuid
from base64 import urlsafe_b64decode, urlsafe_b64encode
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import pyodbc
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads")).resolve()
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
ALLOWED_MIME_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
ALLOWED_IMAGE_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
VALID_STATUSES = {"Reported", "In progress", "Resolved"}
ADMIN_SESSION_SECONDS = 8 * 60 * 60
Image.MAX_IMAGE_PIXELS = 40_000_000


def connection_string() -> str:
    driver = os.getenv("SQL_DRIVER", "ODBC Driver 18 for SQL Server")
    server = os.getenv("SQL_SERVER", "localhost")
    database = os.getenv("SQL_DATABASE", "CityGarbage")
    username = os.getenv("SQL_USERNAME", "")
    password = os.getenv("SQL_PASSWORD", "")
    trust_cert = os.getenv("SQL_TRUST_CERTIFICATE", "true").lower() == "true"
    parts = [
        f"DRIVER={{{driver}}}",
        f"SERVER={server}",
        f"DATABASE={database}",
        "Encrypt=yes",
        f"TrustServerCertificate={'yes' if trust_cert else 'no'}",
    ]
    if username:
        parts.extend([f"UID={username}", f"PWD={password}"])
    else:
        parts.append("Trusted_Connection=yes")
    return ";".join(parts) + ";"


def get_connection():
    try:
        return pyodbc.connect(connection_string(), timeout=5)
    except pyodbc.Error as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable. Check the SQL Server configuration.") from exc


def initialize_database() -> None:
    with closing(get_connection()) as connection:
        connection.cursor().execute(
            """
            IF OBJECT_ID(N'dbo.GarbageReports', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.GarbageReports (
                    Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
                    Description NVARCHAR(1200) NOT NULL,
                    Area NVARCHAR(200) NOT NULL,
                    ReportedAt DATETIME2 NOT NULL,
                    ImageFilename NVARCHAR(80) NOT NULL,
                    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_GarbageReports_Status DEFAULT N'Reported',
                    ContactName NVARCHAR(120) NULL,
                    ContactEmail NVARCHAR(254) NULL,
                    ContactPhone NVARCHAR(40) NULL,
                    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_GarbageReports_CreatedAt DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT CK_GarbageReports_Status CHECK (Status IN (N'Reported', N'In progress', N'Resolved'))
                );
                CREATE INDEX IX_GarbageReports_CreatedAt ON dbo.GarbageReports (CreatedAt DESC);
            END
            """
        )
        connection.commit()


def row_to_report(row, include_contact: bool = False) -> dict:
    report = {
        "id": str(row.Id),
        "description": row.Description,
        "area": row.Area,
        "reported_at": row.ReportedAt.isoformat(),
        "image_url": f"/uploads/{row.ImageFilename}",
        "status": row.Status,
        "created_at": row.CreatedAt.isoformat(),
    }
    if include_contact:
        report.update({
            "contact_name": row.ContactName,
            "contact_email": row.ContactEmail,
            "contact_phone": row.ContactPhone,
        })
    return report


def admin_credentials() -> tuple[str, str]:
    username = os.getenv("ADMIN_USERNAME", "")
    password = os.getenv("ADMIN_PASSWORD", "")
    if not username or len(password) < 12:
        raise HTTPException(
            status_code=503,
            detail="Admin login is not configured. Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters.",
        )
    return username, password


def issue_admin_session(username: str, password: str) -> str:
    expires_at = int(datetime.now(timezone.utc).timestamp()) + ADMIN_SESSION_SECONDS
    payload = urlsafe_b64encode(json.dumps({"sub": username, "exp": expires_at}, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(password.encode(), payload.encode(), "sha256").digest()
    return f"{payload}.{urlsafe_b64encode(signature).decode().rstrip('=')}"


def valid_admin_session(token: str, username: str, password: str) -> bool:
    try:
        payload, supplied_signature = token.split(".", 1)
        expected_signature = urlsafe_b64encode(hmac.new(password.encode(), payload.encode(), "sha256").digest()).decode().rstrip("=")
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return False
        decoded = urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        claims = json.loads(decoded)
        return claims.get("sub") == username and int(claims.get("exp", 0)) > int(datetime.now(timezone.utc).timestamp())
    except (ValueError, TypeError, json.JSONDecodeError):
        return False


def admin_required(authorization: Annotated[str | None, Header()] = None) -> None:
    expected_username, expected_password = admin_credentials()
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not valid_admin_session(supplied, expected_username, expected_password):
        raise HTTPException(status_code=401, detail="A valid admin token is required.")


class AdminLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(min_length=1, max_length=20)


app = FastAPI(title="CleanCity Reports API", version="1.0.0")
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/api/health")
def health() -> dict:
    with closing(get_connection()) as connection:
        connection.cursor().execute("SELECT 1")
    return {"status": "ok"}


@app.get("/api/reports")
def list_reports() -> list[dict]:
    with closing(get_connection()) as connection:
        rows = connection.cursor().execute(
            """
            SELECT TOP (100) Id, Description, Area, ReportedAt, ImageFilename, Status, CreatedAt
            FROM dbo.GarbageReports
            ORDER BY CreatedAt DESC
            """
        ).fetchall()
    return [row_to_report(row) for row in rows]


@app.post("/api/admin/login")
def admin_login(credentials: AdminLogin) -> dict:
    expected_username, expected_password = admin_credentials()
    username_matches = hmac.compare_digest(credentials.username.encode(), expected_username.encode())
    password_matches = hmac.compare_digest(credentials.password.encode(), expected_password.encode())
    if not (username_matches and password_matches):
        raise HTTPException(status_code=401, detail="Invalid admin username or password.")
    return {
        "access_token": issue_admin_session(expected_username, expected_password),
        "token_type": "bearer",
        "expires_in": ADMIN_SESSION_SECONDS,
    }


@app.post("/api/reports", status_code=201)
async def create_report(
    description: Annotated[str, Form(min_length=5, max_length=1200)],
    area: Annotated[str, Form(min_length=2, max_length=200)],
    reported_at: Annotated[datetime, Form()],
    image: Annotated[UploadFile, File()],
    contact_name: Annotated[str | None, Form(max_length=120)] = None,
    contact_email: Annotated[str | None, Form(max_length=254)] = None,
    contact_phone: Annotated[str | None, Form(max_length=40)] = None,
) -> dict:
    description, area = description.strip(), area.strip()
    if len(description) < 5 or len(area) < 2:
        raise HTTPException(status_code=422, detail="Add a more detailed description and location.")
    mime = (image.content_type or "").lower()
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WEBP image.")
    contents = await image.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 8 MB or smaller.")
    try:
        with Image.open(io.BytesIO(contents)) as uploaded:
            if uploaded.format != ALLOWED_IMAGE_FORMATS[mime]:
                raise HTTPException(status_code=415, detail="Upload a valid JPG, PNG, or WEBP image.")
            uploaded.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid image.") from exc

    extension = ALLOWED_MIME_TYPES[mime]
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename
    destination.write_bytes(contents)
    report_id = uuid.uuid4()
    try:
        with closing(get_connection()) as connection:
            row = connection.cursor().execute(
                """
                INSERT INTO dbo.GarbageReports
                    (Id, Description, Area, ReportedAt, ImageFilename, ContactName, ContactEmail, ContactPhone)
                OUTPUT INSERTED.Id, INSERTED.Description, INSERTED.Area, INSERTED.ReportedAt,
                    INSERTED.ImageFilename, INSERTED.Status, INSERTED.CreatedAt
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                str(report_id), description, area, reported_at, filename,
                contact_name.strip() if contact_name and contact_name.strip() else None,
                contact_email.strip() if contact_email and contact_email.strip() else None,
                contact_phone.strip() if contact_phone and contact_phone.strip() else None,
            ).fetchone()
            connection.commit()
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return row_to_report(row)


@app.get("/api/admin/reports", dependencies=[Depends(admin_required)])
def list_admin_reports() -> list[dict]:
    with closing(get_connection()) as connection:
        rows = connection.cursor().execute(
            """
            SELECT TOP (10000) Id, Description, Area, ReportedAt, ImageFilename, Status, CreatedAt,
                ContactName, ContactEmail, ContactPhone
            FROM dbo.GarbageReports
            ORDER BY CreatedAt DESC
            """
        ).fetchall()
    return [row_to_report(row, include_contact=True) for row in rows]


@app.patch("/api/admin/reports/{report_id}", dependencies=[Depends(admin_required)])
def update_report(report_id: uuid.UUID, update: StatusUpdate) -> dict:
    if update.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Status must be Reported, In progress, or Resolved.")
    with closing(get_connection()) as connection:
        row = connection.cursor().execute(
            """
            UPDATE dbo.GarbageReports SET Status = ?
            OUTPUT INSERTED.Id, INSERTED.Description, INSERTED.Area, INSERTED.ReportedAt,
                INSERTED.ImageFilename, INSERTED.Status, INSERTED.CreatedAt,
                INSERTED.ContactName, INSERTED.ContactEmail, INSERTED.ContactPhone
            WHERE Id = ?
            """,
            update.status, str(report_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        connection.commit()
    return row_to_report(row, include_contact=True)


@app.delete("/api/admin/reports/{report_id}", status_code=204, dependencies=[Depends(admin_required)])
def delete_report(report_id: uuid.UUID) -> None:
    with closing(get_connection()) as connection:
        row = connection.cursor().execute(
            "DELETE FROM dbo.GarbageReports OUTPUT DELETED.ImageFilename WHERE Id = ?",
            str(report_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        connection.commit()
    filename = row.ImageFilename
    if re.fullmatch(r"[0-9a-f]{32}\.(jpg|png|webp)", filename):
        with closing(get_connection()) as connection:
            remaining = connection.cursor().execute(
                "SELECT COUNT(*) FROM dbo.GarbageReports WHERE ImageFilename = ?",
                filename,
            ).fetchone()[0]
        if remaining == 0:
            (UPLOAD_DIR / filename).unlink(missing_ok=True)

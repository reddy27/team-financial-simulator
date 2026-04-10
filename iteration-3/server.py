#!/usr/bin/env python3
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


def resolve_db_path():
    # Prefer an explicit DB path when provided by the host.
    explicit = os.environ.get("TEAM_DB_PATH")
    if explicit:
        return Path(explicit)

    # Railway-style persistent volumes are commonly mounted under /app/data.
    railway_data_dir = Path("/app/data")
    if railway_data_dir.exists():
        return railway_data_dir / "team_platform.db"

    return BASE_DIR / "data" / "team_platform.db"


DB_PATH = resolve_db_path()


def now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                persona TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS episodes (
                id INTEGER PRIMARY KEY,
                patient_name TEXT NOT NULL,
                mrn TEXT NOT NULL,
                episode_type TEXT NOT NULL,
                procedure_label TEXT NOT NULL,
                phase TEXT NOT NULL,
                status TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                hcc_score REAL NOT NULL,
                readmission_risk INTEGER NOT NULL,
                sdoh_complete INTEGER NOT NULL DEFAULT 0,
                navigator_id INTEGER NOT NULL,
                surgeon_name TEXT NOT NULL,
                pcp_name TEXT NOT NULL,
                preferred_site TEXT,
                discharge_disposition TEXT,
                admit_date TEXT NOT NULL,
                discharge_date TEXT,
                followup_due_date TEXT,
                episode_close_date TEXT NOT NULL,
                target_price REAL NOT NULL,
                projected_spend REAL NOT NULL,
                actual_spend REAL NOT NULL,
                snf_days INTEGER NOT NULL DEFAULT 0,
                pathway_adherence INTEGER NOT NULL DEFAULT 0,
                telehealth_ready INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                FOREIGN KEY(navigator_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY,
                episode_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                due_at TEXT NOT NULL,
                owner_role TEXT NOT NULL,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                modality TEXT,
                FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS encounters (
                id INTEGER PRIMARY KEY,
                episode_id INTEGER NOT NULL,
                encounter_type TEXT NOT NULL,
                modality TEXT NOT NULL,
                clinician TEXT NOT NULL,
                scheduled_at TEXT NOT NULL,
                status TEXT NOT NULL,
                summary TEXT,
                FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS facilities (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                facility_type TEXT NOT NULL,
                preferred INTEGER NOT NULL DEFAULT 0,
                quality_score REAL NOT NULL,
                avg_los REAL NOT NULL,
                readmission_rate REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS episode_facilities (
                id INTEGER PRIMARY KEY,
                episode_id INTEGER NOT NULL,
                facility_id INTEGER NOT NULL,
                census_status TEXT NOT NULL,
                referral_status TEXT NOT NULL,
                FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
                FOREIGN KEY(facility_id) REFERENCES facilities(id)
            );

            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY,
                episode_id INTEGER NOT NULL,
                metric_name TEXT NOT NULL,
                metric_value TEXT NOT NULL,
                trend TEXT NOT NULL,
                FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY,
                actor_name TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                detail TEXT NOT NULL
            );
            """
        )

        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count:
            return

        conn.executemany(
            "INSERT INTO users (name, role, persona) VALUES (?, ?, ?)",
            [
                ("Avery Chen", "care_navigator", "Care Navigator"),
                ("Dr. Maya Patel", "surgeon", "Orthopedic Surgeon"),
                ("Jordan Lee", "quality", "Quality Lead"),
                ("Sam Rivera", "finance", "Finance Analyst"),
                ("Dr. Noah Brooks", "telehealth", "Telehealth Clinician"),
            ],
        )

        episodes = [
            (
                "Eleanor Vance", "MRN-10428", "LEJR", "Right Total Knee Arthroplasty",
                "post_acute", "active", "high", 2.7, 74, 1, 1, "Dr. Maya Patel",
                "Dr. Terrance Cole", "Lakeview Skilled Nursing", "SNF",
                "2026-04-01", "2026-04-04", "2026-04-11", "2026-05-04",
                28500, 27120, 24380, 6, 88, 1,
                "Post-op mobility improving. Daughter is primary caregiver. Needs transportation support."
            ),
            (
                "Marcus Holloway", "MRN-10429", "CABG", "Coronary Artery Bypass Graft",
                "inpatient", "watch", "high", 3.4, 82, 0, 1, "Dr. Maya Patel",
                "Dr. Imani Ross", "Home with Remote Monitoring", "Home Health",
                "2026-04-06", None, "2026-04-14", "2026-05-10",
                64200, 66840, 50110, 0, 76, 1,
                "High risk for readmission due to CHF history and medication complexity."
            ),
            (
                "Lila Moreno", "MRN-10430", "LEJR", "Left Hip Replacement",
                "pre_op", "active", "moderate", 1.9, 39, 0, 1, "Dr. Maya Patel",
                "Dr. Helen Wu", "Harbor Rehab", "SNF",
                "2026-04-15", None, "2026-04-22", "2026-05-19",
                26600, 25240, 0, 0, 92, 1,
                "Pre-op risk review incomplete. Food insecurity screen pending."
            ),
            (
                "Otis Graham", "MRN-10431", "Sepsis", "Medical Episode Management",
                "closed", "complete", "moderate", 2.2, 28, 1, 1, "Dr. Maya Patel",
                "Dr. Aaron Pike", "Home with PT", "Home Health",
                "2026-03-01", "2026-03-05", "2026-03-12", "2026-04-04",
                19800, 18540, 17980, 0, 95, 1,
                "Closed successfully with complete follow-up and positive reconciliation."
            ),
        ]
        conn.executemany(
            """
            INSERT INTO episodes (
                patient_name, mrn, episode_type, procedure_label, phase, status, risk_level,
                hcc_score, readmission_risk, sdoh_complete, navigator_id, surgeon_name, pcp_name,
                preferred_site, discharge_disposition, admit_date, discharge_date, followup_due_date,
                episode_close_date, target_price, projected_spend, actual_spend, snf_days,
                pathway_adherence, telehealth_ready, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            episodes,
        )

        conn.executemany(
            """
            INSERT INTO tasks (episode_id, title, category, due_at, owner_role, status, priority, modality)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "48-hour discharge call", "follow_up", "2026-04-10T15:00:00Z", "care_navigator", "due", "critical", "phone"),
                (1, "7-day follow-up visit", "follow_up", "2026-04-11T16:00:00Z", "telehealth", "scheduled", "high", "video"),
                (1, "Medication reconciliation", "clinical", "2026-04-10T18:00:00Z", "care_navigator", "in_progress", "high", None),
                (2, "Cardiac pathway variance review", "pathway", "2026-04-11T13:00:00Z", "surgeon", "due", "high", None),
                (2, "Discharge disposition confirmation", "post_acute", "2026-04-12T17:00:00Z", "case_manager", "due", "high", None),
                (3, "Pre-op SDoH screening", "quality", "2026-04-12T14:00:00Z", "care_navigator", "due", "medium", None),
                (3, "Patient-reported outcome survey", "quality", "2026-04-13T15:30:00Z", "quality", "due", "medium", "digital"),
                (4, "Episode closure audit", "compliance", "2026-04-04T11:00:00Z", "quality", "completed", "low", None),
            ],
        )

        conn.executemany(
            """
            INSERT INTO encounters (episode_id, encounter_type, modality, clinician, scheduled_at, status, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "Post-discharge review", "video", "Dr. Noah Brooks", "2026-04-11T16:00:00Z", "scheduled", "Review pain, mobility, and anticoagulation plan."),
                (2, "Discharge planning", "in_person", "Case Management Team", "2026-04-11T12:00:00Z", "scheduled", "Confirm remote monitoring and caregiver readiness."),
                (4, "30-day closure visit", "audio", "Dr. Noah Brooks", "2026-03-29T09:00:00Z", "completed", "No acute issues. Episode closed on target."),
            ],
        )

        conn.executemany(
            "INSERT INTO facilities (name, facility_type, preferred, quality_score, avg_los, readmission_rate) VALUES (?, ?, ?, ?, ?, ?)",
            [
                ("Lakeview Skilled Nursing", "SNF", 1, 4.8, 9.2, 8.1),
                ("Harbor Rehab", "SNF", 1, 4.2, 11.6, 10.4),
                ("Northside Home Health", "HHA", 1, 4.6, 0.0, 7.3),
                ("Community Post-Acute", "SNF", 0, 3.7, 14.4, 13.8),
            ],
        )

        conn.executemany(
            "INSERT INTO episode_facilities (episode_id, facility_id, census_status, referral_status) VALUES (?, ?, ?, ?)",
            [
                (1, 1, "admitted", "accepted"),
                (2, 3, "pending", "review"),
                (3, 2, "preference_only", "not_started"),
            ],
        )

        conn.executemany(
            "INSERT INTO metrics (episode_id, metric_name, metric_value, trend) VALUES (?, ?, ?, ?)",
            [
                (1, "PRO score", "71/100", "up"),
                (1, "SDoH capture", "Complete", "flat"),
                (1, "SNF LOS", "6 days", "up"),
                (2, "Readmission risk", "82%", "up"),
                (2, "Pathway adherence", "76%", "down"),
                (3, "Pre-op readiness", "Pending SDoH", "down"),
                (4, "Reconciliation", "+$1,820", "up"),
            ],
        )

        conn.executemany(
            """
            INSERT INTO audit_logs (actor_name, actor_role, action, entity_type, entity_id, created_at, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ("Avery Chen", "care_navigator", "episode_identified", "episode", 1, "2026-04-04T08:12:00Z", "LEJR episode auto-created within 5 minutes of discharge trigger."),
                ("Sam Rivera", "finance", "reconciliation_modeled", "episode", 4, "2026-04-05T14:20:00Z", "Positive reconciliation estimate recorded."),
                ("Jordan Lee", "quality", "sdoh_completed", "episode", 1, "2026-04-08T10:05:00Z", "Transportation and caregiver support documented."),
            ],
        )


def fetch_all_dicts(cursor):
    return [dict(row) for row in cursor.fetchall()]


def get_users(conn):
    return fetch_all_dicts(conn.execute("SELECT id, name, role, persona FROM users ORDER BY id"))


def get_dashboard(conn):
    episodes = fetch_all_dicts(
        conn.execute(
            """
            SELECT e.*, u.name AS navigator_name
            FROM episodes e
            JOIN users u ON u.id = e.navigator_id
            ORDER BY
                CASE e.status
                    WHEN 'active' THEN 0
                    WHEN 'watch' THEN 1
                    ELSE 2
                END,
                e.readmission_risk DESC
            """
        )
    )
    tasks = fetch_all_dicts(
        conn.execute(
            """
            SELECT t.*, e.patient_name, e.episode_type
            FROM tasks t
            JOIN episodes e ON e.id = t.episode_id
            ORDER BY
                CASE t.status
                    WHEN 'due' THEN 0
                    WHEN 'in_progress' THEN 1
                    WHEN 'scheduled' THEN 2
                    ELSE 3
                END,
                t.due_at ASC
            """
        )
    )
    facilities = fetch_all_dicts(conn.execute("SELECT * FROM facilities ORDER BY preferred DESC, quality_score DESC"))
    logs = fetch_all_dicts(conn.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10"))

    episode_count = len(episodes)
    active = [e for e in episodes if e["status"] in ("active", "watch")]
    readmissions = sum(1 for e in active if e["readmission_risk"] >= 75)
    followups_due = sum(1 for t in tasks if t["category"] == "follow_up" and t["status"] != "completed")
    sdoh_complete = round(100 * sum(e["sdoh_complete"] for e in episodes) / max(episode_count, 1))
    projected_margin = round(sum(e["target_price"] - e["projected_spend"] for e in episodes), 2)
    actual_margin = round(sum(e["target_price"] - e["actual_spend"] for e in episodes), 2)

    analytics = {
        "episodes_identified_24h": 96,
        "followup_7d": 91,
        "snf_los_reduction": 18,
        "readmission_reduction": 12,
        "sdoh_compliance": sdoh_complete,
        "positive_reconciliation_types": 3,
        "projected_margin": projected_margin,
        "actual_margin": actual_margin,
    }

    spotlight = [
        {
            "title": "Missed 48-hour touchpoints",
            "detail": "No overdue call workflows today. One call remains due by 3 PM.",
            "tone": "good",
        },
        {
            "title": "SNF utilization watch",
            "detail": "LEJR episodes average 6.0 SNF days against a 5-day target.",
            "tone": "warning",
        },
        {
            "title": "Reconciliation outlook",
            "detail": "Three episode types are still above zero margin in the current run-rate model.",
            "tone": "good",
        },
    ]

    return {
        "generated_at": now_iso(),
        "users": get_users(conn),
        "summary": {
            "episode_count": episode_count,
            "active_episode_count": len(active),
            "high_risk_episode_count": readmissions,
            "followups_due": followups_due,
            "sdoh_compliance": sdoh_complete,
        },
        "analytics": analytics,
        "spotlight": spotlight,
        "episodes": episodes,
        "tasks": tasks,
        "facilities": facilities,
        "audit_logs": logs,
    }


def get_episode_detail(conn, episode_id):
    episode = conn.execute(
        """
        SELECT e.*, u.name AS navigator_name, u.role AS navigator_role
        FROM episodes e
        JOIN users u ON u.id = e.navigator_id
        WHERE e.id = ?
        """,
        (episode_id,),
    ).fetchone()
    if not episode:
        return None

    tasks = fetch_all_dicts(conn.execute("SELECT * FROM tasks WHERE episode_id = ? ORDER BY due_at ASC", (episode_id,)))
    encounters = fetch_all_dicts(conn.execute("SELECT * FROM encounters WHERE episode_id = ? ORDER BY scheduled_at ASC", (episode_id,)))
    facilities = fetch_all_dicts(
        conn.execute(
            """
            SELECT ef.*, f.name, f.facility_type, f.preferred, f.quality_score, f.avg_los, f.readmission_rate
            FROM episode_facilities ef
            JOIN facilities f ON f.id = ef.facility_id
            WHERE ef.episode_id = ?
            ORDER BY f.preferred DESC, f.quality_score DESC
            """,
            (episode_id,),
        )
    )
    metrics = fetch_all_dicts(conn.execute("SELECT metric_name, metric_value, trend FROM metrics WHERE episode_id = ?", (episode_id,)))
    logs = fetch_all_dicts(
        conn.execute(
            "SELECT * FROM audit_logs WHERE entity_type = 'episode' AND entity_id = ? ORDER BY created_at DESC LIMIT 12",
            (episode_id,),
        )
    )
    return {
        "episode": dict(episode),
        "tasks": tasks,
        "encounters": encounters,
        "facilities": facilities,
        "metrics": metrics,
        "audit_logs": logs,
    }


def user_from_headers(conn, headers):
    raw_user_id = headers.get("X-User-Id")
    if not raw_user_id:
        return conn.execute("SELECT * FROM users ORDER BY id LIMIT 1").fetchone()
    return conn.execute("SELECT * FROM users WHERE id = ?", (raw_user_id,)).fetchone()


def record_audit(conn, actor, action, entity_type, entity_id, detail):
    conn.execute(
        """
        INSERT INTO audit_logs (actor_name, actor_role, action, entity_type, entity_id, created_at, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (actor["name"], actor["role"], action, entity_type, entity_id, now_iso(), detail),
    )


def require_roles(actor, allowed_roles):
    if actor["role"] not in allowed_roles:
        raise PermissionError(f"{actor['persona']} is not allowed to perform this action.")


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "API route not found")
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8") if length else "{}"
        body = json.loads(raw_body or "{}")
        self.handle_api_post(parsed, body)

    def handle_api_get(self, parsed):
        with closing(db_connection()) as conn:
            if parsed.path == "/api/health":
                self.respond_json({"ok": True, "generated_at": now_iso()})
                return

            if parsed.path == "/api/bootstrap":
                self.respond_json(get_dashboard(conn))
                return

            if parsed.path.startswith("/api/episodes/"):
                episode_id = parsed.path.rsplit("/", 1)[-1]
                if not episode_id.isdigit():
                    self.respond_error(HTTPStatus.BAD_REQUEST, "Invalid episode id")
                    return
                detail = get_episode_detail(conn, int(episode_id))
                if not detail:
                    self.respond_error(HTTPStatus.NOT_FOUND, "Episode not found")
                    return
                self.respond_json(detail)
                return

            if parsed.path == "/api/reports/cms":
                report = {
                    "generated_at": now_iso(),
                    "reporting_period": "April 2026",
                    "submission_ready": True,
                    "measures": [
                        {"name": "Episodes identified within 24 hours", "value": "96%"},
                        {"name": "7-day follow-up completion", "value": "91%"},
                        {"name": "SDoH documentation compliance", "value": "75%"},
                        {"name": "Positive reconciliation types", "value": "3"},
                    ],
                }
                self.respond_json(report)
                return

        self.respond_error(HTTPStatus.NOT_FOUND, "Route not found")

    def handle_api_post(self, parsed, body):
        with closing(db_connection()) as conn:
            actor = user_from_headers(conn, self.headers)
            if not actor:
                self.respond_error(HTTPStatus.UNAUTHORIZED, "Unknown user")
                return

            try:
                if parsed.path.startswith("/api/tasks/") and parsed.path.endswith("/complete"):
                    task_id = parsed.path.split("/")[3]
                    self.complete_task(conn, actor, task_id)
                    return

                if parsed.path.startswith("/api/episodes/") and parsed.path.endswith("/status"):
                    episode_id = parsed.path.split("/")[3]
                    self.update_episode_status(conn, actor, episode_id, body)
                    return

                if parsed.path.startswith("/api/episodes/") and parsed.path.endswith("/followups"):
                    episode_id = parsed.path.split("/")[3]
                    self.schedule_followup(conn, actor, episode_id, body)
                    return

                if parsed.path.startswith("/api/episodes/") and parsed.path.endswith("/notes"):
                    episode_id = parsed.path.split("/")[3]
                    self.append_note(conn, actor, episode_id, body)
                    return

            except PermissionError as exc:
                self.respond_error(HTTPStatus.FORBIDDEN, str(exc))
                return
            except ValueError as exc:
                self.respond_error(HTTPStatus.BAD_REQUEST, str(exc))
                return

        self.respond_error(HTTPStatus.NOT_FOUND, "Route not found")

    def complete_task(self, conn, actor, task_id):
        require_roles(actor, {"care_navigator", "quality", "telehealth", "surgeon"})
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise ValueError("Task not found")

        conn.execute("UPDATE tasks SET status = 'completed' WHERE id = ?", (task_id,))
        record_audit(conn, actor, "task_completed", "episode", task["episode_id"], f"Completed task: {task['title']}")
        conn.commit()
        self.respond_json({"ok": True, "dashboard": get_dashboard(conn)})

    def update_episode_status(self, conn, actor, episode_id, body):
        require_roles(actor, {"care_navigator", "quality", "surgeon", "finance"})
        status = body.get("status")
        phase = body.get("phase")
        if status not in {"active", "watch", "complete"}:
            raise ValueError("Status must be active, watch, or complete.")
        if phase not in {"pre_op", "inpatient", "post_acute", "closed"}:
            raise ValueError("Invalid phase.")

        episode = conn.execute("SELECT * FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not episode:
            raise ValueError("Episode not found")

        conn.execute("UPDATE episodes SET status = ?, phase = ? WHERE id = ?", (status, phase, episode_id))
        record_audit(conn, actor, "episode_updated", "episode", int(episode_id), f"Status set to {status}; phase set to {phase}.")
        conn.commit()
        self.respond_json({"ok": True, "episode": get_episode_detail(conn, int(episode_id))})

    def schedule_followup(self, conn, actor, episode_id, body):
        require_roles(actor, {"care_navigator", "telehealth"})
        scheduled_at = body.get("scheduled_at")
        modality = body.get("modality")
        clinician = body.get("clinician") or actor["name"]
        if modality not in {"video", "audio", "in_person"}:
            raise ValueError("Modality must be video, audio, or in_person.")
        if not scheduled_at:
            raise ValueError("scheduled_at is required.")

        episode = conn.execute("SELECT * FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not episode:
            raise ValueError("Episode not found")

        conn.execute(
            """
            INSERT INTO encounters (episode_id, encounter_type, modality, clinician, scheduled_at, status, summary)
            VALUES (?, '7-day follow-up', ?, ?, ?, 'scheduled', ?)
            """,
            (episode_id, modality, clinician, scheduled_at, body.get("summary", "Scheduled from episode workspace.")),
        )
        conn.execute(
            """
            INSERT INTO tasks (episode_id, title, category, due_at, owner_role, status, priority, modality)
            VALUES (?, '7-day follow-up visit', 'follow_up', ?, 'telehealth', 'scheduled', 'high', ?)
            """,
            (episode_id, scheduled_at, modality),
        )
        conn.execute("UPDATE episodes SET followup_due_date = ?, telehealth_ready = 1 WHERE id = ?", (scheduled_at.split("T")[0], episode_id))
        record_audit(conn, actor, "followup_scheduled", "episode", int(episode_id), f"{modality} follow-up scheduled for {scheduled_at}.")
        conn.commit()
        self.respond_json({"ok": True, "episode": get_episode_detail(conn, int(episode_id))})

    def append_note(self, conn, actor, episode_id, body):
        note = (body.get("note") or "").strip()
        if not note:
            raise ValueError("note is required.")
        episode = conn.execute("SELECT notes FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not episode:
            raise ValueError("Episode not found")
        merged_note = (episode["notes"] + "\n\n" if episode["notes"] else "") + f"[{now_iso()}] {actor['name']}: {note}"
        conn.execute("UPDATE episodes SET notes = ? WHERE id = ?", (merged_note, episode_id))
        record_audit(conn, actor, "note_added", "episode", int(episode_id), "Added episode note.")
        conn.commit()
        self.respond_json({"ok": True, "episode": get_episode_detail(conn, int(episode_id))})

    def respond_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_error(self, status, message):
        self.respond_json({"error": message}, status=status)


def run():
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"TEAM platform running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()

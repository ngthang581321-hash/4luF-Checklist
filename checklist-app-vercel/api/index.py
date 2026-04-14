"""
Checklist App — FastAPI serverless for Vercel
Database: PostgreSQL via psycopg2 (no SQLAlchemy)
"""
import os
import re
import psycopg2
import psycopg2.extras
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone


app = FastAPI(title="Checklist App", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
CRON_SECRET  = os.environ.get("CRON_SECRET", "")


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS checklists (
                id              SERIAL PRIMARY KEY,
                title           VARCHAR(200) NOT NULL,
                description     TEXT DEFAULT '',
                color           VARCHAR(20) DEFAULT '#3b82f6',
                is_default      BOOLEAN DEFAULT FALSE,
                checklist_type  VARCHAR(20) DEFAULT 'special',
                created_at      TIMESTAMP DEFAULT NOW(),
                updated_at      TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id                      SERIAL PRIMARY KEY,
                checklist_id            INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
                title                   VARCHAR(500) NOT NULL,
                note                    TEXT DEFAULT '',
                completed               BOOLEAN DEFAULT FALSE,
                in_progress             BOOLEAN DEFAULT FALSE,
                priority                VARCHAR(10) DEFAULT 'medium',
                due_date                VARCHAR(10),
                remind_at               TIMESTAMP,
                remind_interval_minutes INTEGER,
                remind_before_days      INTEGER,
                completed_at            TIMESTAMP,
                created_at              TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id               SERIAL PRIMARY KEY,
                telegram_token   VARCHAR(200) DEFAULT '',
                telegram_chat_id VARCHAR(100) DEFAULT '',
                notify_new_task  BOOLEAN DEFAULT TRUE,
                notify_complete  BOOLEAN DEFAULT TRUE
            )
        """)
        conn.commit()

        # Seed Settings if empty
        cur.execute("SELECT COUNT(*) FROM settings")
        if cur.fetchone()["count"] == 0:
            cur.execute("INSERT INTO settings (id) VALUES (1)")
            conn.commit()

        # Seed Daily Tasks if not exists
        cur.execute("SELECT id FROM checklists WHERE checklist_type = 'daily' LIMIT 1")
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO checklists (title, description, color, is_default, checklist_type)
                VALUES ('Daily Tasks', 'Công việc hằng ngày', '#10b981', TRUE, 'daily')
            """)
            conn.commit()

        # Seed Fixed Tasks if not exists
        cur.execute("SELECT id FROM checklists WHERE checklist_type = 'fixed' LIMIT 1")
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO checklists (title, description, color, is_default, checklist_type)
                VALUES ('Fixed Tasks', 'Việc cố định, không bị chuyển theo ngày', '#8b5cf6', TRUE, 'fixed')
            """)
            conn.commit()

        cur.close()
    finally:
        conn.close()


# Init DB on cold start
try:
    init_db()
except Exception as e:
    print(f"init_db error: {e}")


# ── Serializers ───────────────────────────────────────────────────────────────

def _fmt_dt(val) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    return val.isoformat()


def _task_row(row: dict) -> dict:
    return {
        "id":                      row["id"],
        "checklist_id":            row["checklist_id"],
        "title":                   row["title"],
        "note":                    row["note"] or "",
        "completed":               bool(row["completed"]),
        "in_progress":             bool(row["in_progress"]),
        "priority":                row["priority"] or "medium",
        "due_date":                row["due_date"],
        "remind_at":               _fmt_dt(row["remind_at"]),
        "remind_interval_minutes": row["remind_interval_minutes"],
        "remind_before_days":      row["remind_before_days"],
        "completed_at":            _fmt_dt(row["completed_at"]),
        "created_at":              _fmt_dt(row["created_at"]),
    }


def _checklist_row(row: dict, tasks: list) -> dict:
    done_count = sum(1 for t in tasks if t["completed"])
    return {
        "id":             row["id"],
        "title":          row["title"],
        "description":    row["description"] or "",
        "color":          row["color"] or "#3b82f6",
        "is_default":     bool(row["is_default"]),
        "checklist_type": row["checklist_type"] or "special",
        "created_at":     _fmt_dt(row["created_at"]),
        "updated_at":     _fmt_dt(row["updated_at"]),
        "task_count":     len(tasks),
        "done_count":     done_count,
        "tasks":          tasks,
    }


def _fetch_checklist_with_tasks(conn, cid: int) -> Optional[dict]:
    cur = conn.cursor()
    cur.execute("SELECT * FROM checklists WHERE id = %s", (cid,))
    cl = cur.fetchone()
    if not cl:
        cur.close()
        return None
    cur.execute("SELECT * FROM tasks WHERE checklist_id = %s ORDER BY created_at", (cid,))
    tasks = [_task_row(t) for t in cur.fetchall()]
    cur.close()
    return _checklist_row(cl, tasks)


# ── Telegram ──────────────────────────────────────────────────────────────────

async def send_telegram(token: str, chat_id: str, text: str):
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
    except Exception:
        pass


def fmt_task_added(checklist_title: str, task_title: str) -> str:
    return (
        f"📋 <b>Task mới được thêm</b>\n"
        f"Checklist: <i>{checklist_title}</i>\n"
        f"Task: <b>{task_title}</b>"
    )


def fmt_task_done(checklist_title: str, task_title: str) -> str:
    return (
        f"✅ <b>Task hoàn thành!</b>\n"
        f"Checklist: <i>{checklist_title}</i>\n"
        f"Task: <b>{task_title}</b>"
    )


# ── Pydantic models ───────────────────────────────────────────────────────────

class ChecklistCreate(BaseModel):
    title: str
    description: str = ""
    color: str = "#3b82f6"
    checklist_type: str = "special"

class ChecklistUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None

class TaskCreate(BaseModel):
    title: str
    note: str = ""
    priority: str = "medium"
    due_date: Optional[str] = None
    remind_minutes: Optional[int] = None
    remind_start_mode: Optional[str] = "now"
    remind_before_days: Optional[int] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    completed: Optional[bool] = None
    in_progress: Optional[bool] = None
    remind_minutes: Optional[int] = None
    remind_before_days: Optional[int] = None

class SettingsUpdate(BaseModel):
    telegram_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    notify_new_task: Optional[bool] = None
    notify_complete: Optional[bool] = None


# ── CRON auth helper ──────────────────────────────────────────────────────────

def _verify_cron(request: Request):
    if not CRON_SECRET:
        return  # no secret configured, skip auth
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {CRON_SECRET}"
    if auth != expected:
        raise HTTPException(401, "Unauthorized")


# ── Checklists ────────────────────────────────────────────────────────────────

@app.get("/api/checklists")
def list_checklists():
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM checklists ORDER BY updated_at DESC")
        rows = cur.fetchall()
        result = []
        for row in rows:
            cur2 = conn.cursor()
            cur2.execute("SELECT * FROM tasks WHERE checklist_id = %s ORDER BY created_at", (row["id"],))
            tasks = [_task_row(t) for t in cur2.fetchall()]
            cur2.close()
            result.append(_checklist_row(row, tasks))
        cur.close()
        return result
    finally:
        conn.close()


@app.post("/api/checklists", status_code=201)
def create_checklist(body: ChecklistCreate):
    conn = get_conn()
    try:
        cl_type = body.checklist_type if body.checklist_type in ("date", "special") else "special"
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO checklists (title, description, color, checklist_type)
            VALUES (%s, %s, %s, %s) RETURNING id
        """, (body.title, body.description, body.color, cl_type))
        new_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        result = _fetch_checklist_with_tasks(conn, new_id)
        return result
    finally:
        conn.close()


@app.get("/api/checklists/{cid}")
def get_checklist(cid: int):
    conn = get_conn()
    try:
        result = _fetch_checklist_with_tasks(conn, cid)
        if not result:
            raise HTTPException(404, "Not found")
        return result
    finally:
        conn.close()


@app.patch("/api/checklists/{cid}")
def update_checklist(cid: int, body: ChecklistUpdate):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM checklists WHERE id = %s", (cid,))
        if not cur.fetchone():
            raise HTTPException(404, "Not found")
        updates = body.model_dump(exclude_none=True)
        if updates:
            set_parts = [f"{k} = %s" for k in updates]
            vals = list(updates.values())
            vals.append(datetime.utcnow())
            vals.append(cid)
            cur.execute(f"UPDATE checklists SET {', '.join(set_parts)}, updated_at = %s WHERE id = %s", vals)
            conn.commit()
        cur.close()
        return _fetch_checklist_with_tasks(conn, cid)
    finally:
        conn.close()


@app.delete("/api/checklists/{cid}", status_code=204)
def delete_checklist(cid: int):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, is_default FROM checklists WHERE id = %s", (cid,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        if row["is_default"]:
            raise HTTPException(403, "Không thể xóa checklist mặc định")
        cur.execute("DELETE FROM checklists WHERE id = %s", (cid,))
        conn.commit()
        cur.close()
    finally:
        conn.close()


# ── Tasks ─────────────────────────────────────────────────────────────────────

@app.get("/api/checklists/{cid}/tasks")
def list_tasks(cid: int):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM checklists WHERE id = %s", (cid,))
        if not cur.fetchone():
            raise HTTPException(404, "Checklist not found")
        cur.execute("SELECT * FROM tasks WHERE checklist_id = %s ORDER BY created_at", (cid,))
        tasks = [_task_row(t) for t in cur.fetchall()]
        cur.close()
        return tasks
    finally:
        conn.close()


@app.post("/api/checklists/{cid}/tasks", status_code=201)
async def create_task(cid: int, body: TaskCreate):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, is_default, title FROM checklists WHERE id = %s", (cid,))
        cl_row = cur.fetchone()
        if not cl_row:
            raise HTTPException(404, "Checklist not found")

        # Daily Tasks: always use today VN date
        due_date = body.due_date
        if cl_row["is_default"]:
            today_vn = (datetime.now(timezone.utc) + timedelta(hours=7)).strftime("%Y-%m-%d")
            due_date = today_vn

        # Set up recurring reminder
        remind_at = None
        interval  = None
        if body.remind_minutes and body.remind_minutes > 0:
            interval = body.remind_minutes
            if body.remind_start_mode == "due_date" and body.due_date:
                remind_at = datetime.strptime(body.due_date, "%Y-%m-%d")
            else:
                remind_at = datetime.utcnow() + timedelta(minutes=body.remind_minutes)

        cur.execute("""
            INSERT INTO tasks
                (checklist_id, title, note, priority, due_date, remind_at,
                 remind_interval_minutes, remind_before_days)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            cid, body.title, body.note, body.priority, due_date,
            remind_at, interval, body.remind_before_days,
        ))
        new_id = cur.fetchone()["id"]

        # Bump checklist updated_at
        cur.execute("UPDATE checklists SET updated_at = %s WHERE id = %s", (datetime.utcnow(), cid))
        conn.commit()

        # Fetch created task
        cur.execute("SELECT * FROM tasks WHERE id = %s", (new_id,))
        task = _task_row(cur.fetchone())
        cur.close()

        # Telegram notification
        cur2 = conn.cursor()
        cur2.execute("SELECT * FROM settings LIMIT 1")
        s = cur2.fetchone()
        cur2.close()
        if s and s["notify_new_task"]:
            await send_telegram(s["telegram_token"], s["telegram_chat_id"],
                                fmt_task_added(cl_row["title"], body.title))

        return task
    finally:
        conn.close()


@app.patch("/api/tasks/{tid}")
async def update_task(tid: int, body: TaskUpdate):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM tasks WHERE id = %s", (tid,))
        t = cur.fetchone()
        if not t:
            raise HTTPException(404, "Task not found")
        was_done = bool(t["completed"])

        # Build update set
        fields = {}
        update_data = body.model_dump(exclude_none=True, exclude={"remind_minutes"})
        fields.update(update_data)

        # State consistency
        if body.completed is True:
            fields["in_progress"] = False
        elif body.in_progress is True:
            fields["completed"] = False
            fields["completed_at"] = None

        # Reschedule/cancel reminder
        if body.remind_minutes is not None:
            if body.remind_minutes > 0:
                fields["remind_interval_minutes"] = body.remind_minutes
                fields["remind_at"] = datetime.utcnow() + timedelta(minutes=body.remind_minutes)
            else:
                fields["remind_interval_minutes"] = None
                fields["remind_at"] = None

        # Track completion timestamp
        if body.completed is True and not was_done:
            fields["completed_at"] = datetime.utcnow()
        elif body.completed is False:
            fields["completed_at"] = None

        if fields:
            set_parts = [f"{k} = %s" for k in fields]
            vals = list(fields.values()) + [tid]
            cur.execute(f"UPDATE tasks SET {', '.join(set_parts)} WHERE id = %s", vals)
            conn.commit()

        cur.execute("SELECT * FROM tasks WHERE id = %s", (tid,))
        task = _task_row(cur.fetchone())

        # Telegram notification on completion
        if body.completed is True and not was_done:
            cur2 = conn.cursor()
            cur2.execute("SELECT title FROM checklists WHERE id = %s", (t["checklist_id"],))
            cl = cur2.fetchone()
            cur2.execute("SELECT * FROM settings LIMIT 1")
            s = cur2.fetchone()
            cur2.close()
            if s and s["notify_complete"] and cl:
                await send_telegram(s["telegram_token"], s["telegram_chat_id"],
                                    fmt_task_done(cl["title"], t["title"]))

        cur.close()
        return task
    finally:
        conn.close()


@app.delete("/api/tasks/{tid}", status_code=204)
def delete_task(tid: int):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM tasks WHERE id = %s", (tid,))
        if not cur.fetchone():
            raise HTTPException(404, "Task not found")
        cur.execute("DELETE FROM tasks WHERE id = %s", (tid,))
        conn.commit()
        cur.close()
    finally:
        conn.close()


# ── Calendar ──────────────────────────────────────────────────────────────────

@app.get("/api/calendar")
def get_calendar(year: int, month: int):
    conn = get_conn()
    try:
        pad    = lambda n: str(n).zfill(2)
        prefix = f"{year}-{pad(month)}-"
        cur = conn.cursor()
        cur.execute("SELECT * FROM tasks WHERE due_date LIKE %s", (f"{prefix}%",))
        tasks = cur.fetchall()
        cur.close()

        by_day: dict = {}
        for t in tasks:
            d = t["due_date"]
            if d not in by_day:
                by_day[d] = {"date": d, "total": 0, "done": 0, "in_progress": 0, "tasks": []}
            by_day[d]["total"] += 1
            if t["completed"]:
                by_day[d]["done"] += 1
            elif t["in_progress"]:
                by_day[d]["in_progress"] += 1
            by_day[d]["tasks"].append(_task_row(t))

        return list(by_day.values())
    finally:
        conn.close()


# ── Daily flush ───────────────────────────────────────────────────────────────

@app.post("/api/daily-flush")
def daily_flush():
    conn = get_conn()
    try:
        today_vn = (datetime.now(timezone.utc) + timedelta(hours=7)).strftime("%Y-%m-%d")
        cur = conn.cursor()

        # Get Daily Tasks checklist
        cur.execute("SELECT id FROM checklists WHERE checklist_type = 'daily' LIMIT 1")
        daily_row = cur.fetchone()
        moved = 0

        # ── Job 1: archive overdue tasks from Daily Tasks ─────────────────────
        if daily_row:
            daily_id = daily_row["id"]
            cur.execute("""
                SELECT * FROM tasks
                WHERE checklist_id = %s AND due_date IS NOT NULL AND due_date < %s
            """, (daily_id, today_vn))
            overdue = cur.fetchall()

            # Group by date
            by_date = {}
            for t in overdue:
                by_date.setdefault(t["due_date"], []).append(t)

            for date_str, tasks_list in by_date.items():
                y, m, d = date_str.split("-")
                title = f"{d}-{m}-{y}"

                has_incomplete = any(not t["completed"] for t in tasks_list)
                has_completed  = any(t["completed"] for t in tasks_list)
                if has_incomplete and has_completed:
                    description = "Task hoàn thành & chưa hoàn thành"
                elif has_completed:
                    description = "Task đã hoàn thành"
                else:
                    description = "Task chưa hoàn thành"

                # Find or create archive checklist
                cur.execute("""
                    SELECT id FROM checklists
                    WHERE title = %s AND checklist_type = 'special' LIMIT 1
                """, (title,))
                dest = cur.fetchone()
                if not dest:
                    cur.execute("""
                        INSERT INTO checklists (title, description, color, checklist_type)
                        VALUES (%s, %s, '#f59e0b', 'special') RETURNING id
                    """, (title, description))
                    dest_id = cur.fetchone()["id"]
                else:
                    dest_id = dest["id"]
                    cur.execute("UPDATE checklists SET description = %s WHERE id = %s",
                                (description, dest_id))

                for t in tasks_list:
                    cur.execute("UPDATE tasks SET checklist_id = %s WHERE id = %s",
                                (dest_id, t["id"]))
                    moved += 1

        # ── Job 2: promote date-type checklists due today ─────────────────────
        y2, m2, d2 = today_vn.split("-")
        today_title = f"{d2}-{m2}-{y2}"

        cur.execute("SELECT * FROM checklists WHERE checklist_type = 'date'")
        date_lists = cur.fetchall()

        promoted = 0
        for cl in date_lists:
            if cl["title"] != today_title:
                continue
            if daily_row:
                daily_id = daily_row["id"]
                cur.execute("""
                    UPDATE tasks
                    SET checklist_id = %s, due_date = %s, completed = FALSE,
                        in_progress = FALSE, completed_at = NULL
                    WHERE checklist_id = %s
                """, (daily_id, today_vn, cl["id"]))
                promoted += cur.rowcount
            cur.execute("DELETE FROM checklists WHERE id = %s", (cl["id"],))

        conn.commit()
        cur.close()
        return {"moved": moved, "promoted": promoted}
    finally:
        conn.close()


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
def get_settings():
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM settings LIMIT 1")
        s = cur.fetchone()
        cur.close()
        if not s:
            return {"telegram_token": "", "telegram_chat_id": "",
                    "notify_new_task": True, "notify_complete": True}
        return {
            "telegram_token":   s["telegram_token"],
            "telegram_chat_id": s["telegram_chat_id"],
            "notify_new_task":  bool(s["notify_new_task"]),
            "notify_complete":  bool(s["notify_complete"]),
        }
    finally:
        conn.close()


@app.patch("/api/settings")
def update_settings(body: SettingsUpdate):
    conn = get_conn()
    try:
        updates = body.model_dump(exclude_none=True)
        if updates:
            set_parts = [f"{k} = %s" for k in updates]
            vals = list(updates.values())
            cur = conn.cursor()
            cur.execute(f"UPDATE settings SET {', '.join(set_parts)} WHERE id = 1", vals)
            conn.commit()
            cur.close()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/settings/test")
async def test_telegram():
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM settings LIMIT 1")
        s = cur.fetchone()
        cur.close()
        if not s or not s["telegram_token"] or not s["telegram_chat_id"]:
            raise HTTPException(400, "Token và Chat ID chưa được cấu hình")
        await send_telegram(s["telegram_token"], s["telegram_chat_id"],
                            "✅ Kết nối Telegram thành công từ Checklist App!")
        return {"ok": True}
    finally:
        conn.close()


# ── Liverpool fixtures ────────────────────────────────────────────────────────

@app.get("/api/liverpool/fixtures")
async def get_liverpool_fixtures():
    url = "https://www.espn.com/soccer/team/fixtures/_/id/364/liverpool"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        r = await client.get(url, headers=headers)

    if r.status_code != 200:
        raise HTTPException(502, f"ESPN returned {r.status_code}")

    html = r.text
    fixtures = []

    for m in re.finditer(r'"date":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)"', html):
        pos    = m.start()
        dt_str = m.group(1)
        ctx    = html[max(0, pos - 600): pos + 100]

        teams = re.findall(r'"displayName":"([^"]+)"', ctx)
        if len(teams) < 2:
            continue

        home, away = teams[-2], teams[-1]
        dt_utc = datetime.strptime(dt_str, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        dt_vn  = dt_utc + timedelta(hours=7)

        fixtures.append({
            "date":     dt_vn.strftime("%Y-%m-%d"),
            "time":     dt_vn.strftime("%H:%M"),
            "home":     home,
            "away":     away,
            "opponent": away if home == "Liverpool" else home,
            "is_home":  home == "Liverpool",
        })

    seen = set()
    result = []
    for f in sorted(fixtures, key=lambda x: x["date"] + x["time"]):
        key = f["date"] + f["home"] + f["away"]
        if key not in seen:
            seen.add(key)
            result.append(f)

    return result


# ── Reminder ping (POST — manual trigger) ────────────────────────────────────

@app.post("/api/reminders/ping")
async def reminders_ping():
    """Manual trigger — same logic as cron."""
    return await _run_reminder_logic()


# ── Reminder cron (GET — called by Vercel Cron) ──────────────────────────────

@app.get("/api/reminders/cron")
async def reminders_cron(request: Request):
    """Vercel Cron endpoint. Vercel injects Authorization: Bearer {CRON_SECRET}."""
    _verify_cron(request)
    return await _run_reminder_logic()


# ── Daily flush cron (GET — called by Vercel Cron) ───────────────────────────

@app.get("/api/daily-flush-cron")
async def daily_flush_cron(request: Request):
    """Vercel Cron endpoint for daily flush (17:01 UTC = 00:01 VN)."""
    _verify_cron(request)
    return daily_flush()


# ── Shared reminder logic ─────────────────────────────────────────────────────

async def _run_reminder_logic():
    conn = get_conn()
    try:
        now_utc = datetime.utcnow()
        now_vn  = datetime.now(timezone.utc) + timedelta(hours=7)

        cur = conn.cursor()
        cur.execute("SELECT * FROM settings LIMIT 1")
        s = cur.fetchone()
        token   = s["telegram_token"]   if s else ""
        chat_id = s["telegram_chat_id"] if s else ""

        # ── 1. Repeat reminders ──────────────────────────────────────────────
        cur.execute("""
            SELECT t.*, c.title AS checklist_title
            FROM tasks t
            LEFT JOIN checklists c ON c.id = t.checklist_id
            WHERE t.remind_at IS NOT NULL
              AND t.remind_interval_minutes IS NOT NULL
              AND t.completed = FALSE
              AND t.remind_at <= %s
        """, (now_utc,))
        pending = cur.fetchall()

        fired = 0
        for task in pending:
            text = (
                f"⏰ <b>Nhắc nhở task chưa làm!</b>\n"
                f"📋 Checklist: <i>{task['checklist_title'] or ''}</i>\n"
                f"✏️ Task: <b>{task['title']}</b>\n"
                f"🔁 Nhắc lại sau {task['remind_interval_minutes']} phút"
            )
            if token and chat_id:
                await send_telegram(token, chat_id, text)
            new_remind = now_utc + timedelta(minutes=task["remind_interval_minutes"])
            cur.execute("UPDATE tasks SET remind_at = %s WHERE id = %s",
                        (new_remind, task["id"]))
            fired += 1

        # ── 2. remind_before_days — fire at 10:00 VN ─────────────────────────
        early_fired = 0
        if now_vn.hour == 10 and now_vn.minute == 0:
            today_vn = now_vn.strftime("%Y-%m-%d")
            cur.execute("""
                SELECT t.*, c.title AS checklist_title
                FROM tasks t
                LEFT JOIN checklists c ON c.id = t.checklist_id
                WHERE t.remind_before_days IS NOT NULL
                  AND t.completed = FALSE
                  AND t.due_date IS NOT NULL
            """)
            early_tasks = cur.fetchall()
            for task in early_tasks:
                try:
                    due = datetime.strptime(task["due_date"], "%Y-%m-%d")
                except ValueError:
                    continue
                from datetime import timedelta as td
                fire_date = (due - td(days=task["remind_before_days"])).strftime("%Y-%m-%d")
                if fire_date != today_vn:
                    continue
                days_left = task["remind_before_days"]
                text = (
                    f"📅 <b>Nhắc trước hạn!</b>\n"
                    f"📋 Checklist: <i>{task['checklist_title'] or ''}</i>\n"
                    f"✏️ Task: <b>{task['title']}</b>\n"
                    f"📆 Hạn: {task['due_date']} (còn {days_left} ngày)"
                )
                if token and chat_id:
                    await send_telegram(token, chat_id, text)
                early_fired += 1

        if fired > 0:
            conn.commit()

        cur.close()
        return {"fired": fired, "early_fired": early_fired}
    finally:
        conn.close()


@app.get("/api")
def root():
    return {"status": "ok", "app": "Checklist App (Vercel)"}

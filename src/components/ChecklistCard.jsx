import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, Flag, Calendar, Bell, ChevronDown, ChevronUp, Clock, X } from 'lucide-react'
import { createTask, updateTask, deleteTask, updateChecklist, deleteChecklist } from '../api'

const PRIORITY_COLOR = { high: 'text-red-400', medium: 'text-amber-400', low: 'text-blue-400' }
const PRIORITY_BG    = { high: 'bg-red-500/10 border-red-500/30', medium: 'bg-amber-500/10 border-amber-500/30', low: 'bg-blue-500/10 border-blue-500/30' }
const PRIORITY_LABEL = { high: 'Cao', medium: 'TB', low: 'Thấp' }

// Colored dot: white=todo, yellow=in_progress, green=done
function StatusDot({ completed, inProgress }) {
  if (completed)   return <span className="w-4 h-4 rounded-full bg-emerald-400 flex-shrink-0 mt-0.5 ring-2 ring-emerald-400/30" />
  if (inProgress)  return <span className="w-4 h-4 rounded-full bg-amber-400 flex-shrink-0 mt-0.5 ring-2 ring-amber-400/30" />
  return <span className="w-4 h-4 rounded-full border-2 border-slate-500 flex-shrink-0 mt-0.5 hover:border-slate-300 transition-colors" />
}

// Live countdown: "mm:ss" until remind_at, refreshes every second
function Countdown({ remindAt, intervalMinutes }) {
  const calcSecs = useCallback(() => {
    if (!remindAt) return null
    const target = new Date(remindAt + (remindAt.endsWith('Z') ? '' : 'Z')).getTime()
    return Math.max(0, Math.floor((target - Date.now()) / 1000))
  }, [remindAt])

  const [secs, setSecs] = useState(calcSecs)

  useEffect(() => {
    setSecs(calcSecs())
    const id = setInterval(() => setSecs(calcSecs()), 1000)
    return () => clearInterval(id)
  }, [calcSecs])

  if (secs === null) return null

  const m = Math.floor(secs / 60)
  const s = secs % 60
  const display = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono font-medium animate-pulse">
      <Bell className="w-3 h-3 flex-shrink-0" />
      {secs === 0 ? 'Đang nhắc...' : display}
      {intervalMinutes && <span className="text-amber-400/60 font-sans">({intervalMinutes}p/lần)</span>}
    </span>
  )
}

// Dropdown rendered into document.body to escape any overflow:hidden ancestors
function ReminderDropdown({ anchorRef, onSelect, onCancel, hasReminder, onClose }) {
  const [customMin, setCustomMin] = useState('')
  const [pos, setPos]             = useState({ top: 0, left: 0 })
  const dropRef = useRef(null)

  useEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const dropW = 220
    let left = rect.right - dropW
    let top  = rect.bottom + 6
    // Keep inside viewport
    if (left < 8) left = 8
    if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8
    setPos({ top, left })
  }, [anchorRef])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  return createPortal(
    <div
      ref={dropRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 220, zIndex: 9999 }}
      className="bg-[#1a1d27] border border-[#2a2f45] rounded-2xl shadow-2xl p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Nhắc lặp lại mỗi
        </span>
        <button onClick={onClose} className="p-0.5 rounded text-slate-600 hover:text-white cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {[1, 5, 15].map(m => (
          <button key={m} onClick={() => { onSelect(m); onClose() }}
            className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
            {m} phút
          </button>
        ))}

        <div className="flex items-center gap-2 pt-2 border-t border-[#2a2f45] mt-1">
          <input
            type="number" min="1" max="1440" placeholder="Tuỳ chỉnh..."
            value={customMin}
            onChange={e => setCustomMin(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && customMin) { onSelect(parseInt(customMin)); onClose() } }}
            className="flex-1 text-sm bg-[#252a40] border border-[#2a2f45] rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500 placeholder:text-slate-600"
          />
          <button
            onClick={() => { if (customMin) { onSelect(parseInt(customMin)); onClose() } }}
            disabled={!customMin}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-xl disabled:opacity-40 cursor-pointer transition-colors font-medium">
            OK
          </button>
        </div>

        {hasReminder && (
          <button onClick={() => { onCancel(); onClose() }}
            className="w-full text-left px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer mt-1">
            Tắt nhắc nhở
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}


function TaskRow({ task, onUpdate, onDelete }) {
  const [editing, setEditing]       = useState(false)
  const [title, setTitle]           = useState(task.title)
  const [remindOpen, setRemindOpen] = useState(false)
  const bellRef = useRef(null)

  // Cycle: todo → in_progress → completed → todo
  const cycleStatus = () => {
    if (task.completed)       return onUpdate(task.id, { completed: false, in_progress: false })
    if (task.in_progress)     return onUpdate(task.id, { completed: true,  in_progress: false })
    /* todo → in_progress */  return onUpdate(task.id, { in_progress: true, completed: false })
  }

  const saveTitle = () => {
    if (title.trim() && title !== task.title)
      onUpdate(task.id, { title: title.trim() })
    setEditing(false)
  }

  const hasReminder = !task.completed && task.remind_at && task.remind_interval_minutes

  const rowOpacity = task.completed ? 'opacity-55' : ''
  const titleStyle = task.completed
    ? 'line-through text-slate-500'
    : task.in_progress ? 'text-amber-100' : 'text-slate-100'

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 transition-all hover:bg-white/5 ${rowOpacity}`}>

      {/* Status dot */}
      <button onClick={cycleStatus} title="Chuyển trạng thái" className="cursor-pointer transition-transform hover:scale-110 mt-0.5">
        <StatusDot completed={task.completed} inProgress={task.in_progress} />
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input autoFocus value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full text-sm bg-transparent border-b border-blue-500 outline-none text-white pb-0.5"
          />
        ) : (
          <span
            className={`text-sm leading-snug cursor-text select-none ${titleStyle}`}
            onClick={() => !task.completed && setEditing(true)}>
            {task.title}
          </span>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${PRIORITY_BG[task.priority]} ${PRIORITY_COLOR[task.priority]}`}>
            <Flag className="w-2.5 h-2.5" />{PRIORITY_LABEL[task.priority]}
          </span>
          {/* Status badge — clickable to cycle */}
          <button onClick={cycleStatus}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all hover:opacity-80 ${
              task.completed   ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' :
              task.in_progress ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'       :
                                 'bg-slate-700/60 border-slate-600/60 text-slate-300 hover:text-white hover:border-slate-400'
            }`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              task.completed ? 'bg-emerald-400' : task.in_progress ? 'bg-amber-400' : 'bg-slate-500'
            }`} />
            {task.completed ? 'Xong' : task.in_progress ? 'Đang làm' : 'Chưa làm'}
          </button>
          {task.due_date && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Calendar className="w-3 h-3" />{task.due_date}
            </span>
          )}
          {hasReminder && (
            <Countdown remindAt={task.remind_at} intervalMinutes={task.remind_interval_minutes} />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all mt-0.5 flex-shrink-0">
        {!task.completed && (
          <>
            <button
              ref={bellRef}
              onClick={() => setRemindOpen(o => !o)}
              title="Đặt nhắc nhở lặp lại"
              className={`p-2 rounded-xl transition-all cursor-pointer ${hasReminder ? 'text-amber-400 bg-amber-400/10' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-400/10'}`}>
              <Bell className="w-4 h-4" />
            </button>
            {remindOpen && (
              <ReminderDropdown
                anchorRef={bellRef}
                hasReminder={!!hasReminder}
                onSelect={m => onUpdate(task.id, { remind_minutes: m })}
                onCancel={() => onUpdate(task.id, { remind_minutes: 0 })}
                onClose={() => setRemindOpen(false)}
              />
            )}
          </>
        )}
        <button onClick={() => onDelete(task.id)}
          className="p-2 rounded-xl text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}


function AddTaskForm({ checklistId, onAdded, isDefault }) {
  const [title, setTitle]               = useState('')
  const [priority, setPriority]         = useState('medium')
  const [dueDate, setDueDate]           = useState('')
  const [remindMin, setRemindMin]       = useState('')
  const [customMin, setCustomMin]       = useState('')
  const [remindStart, setRemindStart]   = useState('now')
  const [remindBefore, setRemindBefore] = useState(false)   // enable remind_before_days
  const [remindBeforeDays, setRemindBeforeDays] = useState('3')
  const [loading, setLoading]           = useState(false)
  const [expanded, setExpanded]         = useState(false)

  const currentYear = new Date(Date.now() + 7 * 3600_000).getUTCFullYear()
  const todayVN = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  const minDate = `${currentYear}-01-01`
  const isFutureDate = dueDate && dueDate > todayVN

  const effectiveRemind = remindMin === 'custom'
    ? (parseInt(customMin) || null)
    : remindMin ? parseInt(remindMin) : null

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const res = await createTask(checklistId, {
        title: title.trim(), priority,
        due_date: dueDate || null,
        remind_minutes: effectiveRemind,
        remind_start_mode: effectiveRemind ? remindStart : 'now',
        remind_before_days: (isFutureDate && remindBefore) ? (parseInt(remindBeforeDays) || null) : null,
      })
      onAdded(res.data)
      setTitle(''); setDueDate(''); setPriority('medium')
      setRemindMin(''); setCustomMin(''); setRemindStart('now')
      setRemindBefore(false); setRemindBeforeDays('3'); setExpanded(false)
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="px-4 pb-4 pt-2 border-t border-[#2a2f45]/50">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="+ Thêm task mới..."
          className="flex-1 text-sm bg-[#252a40] border border-[#2a2f45] rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 text-white placeholder:text-slate-600 transition-colors"
        />
        {title.trim() && (
          <button type="submit" disabled={loading}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl font-medium transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap">
            {loading ? '...' : 'Thêm'}
          </button>
        )}
      </div>

      {expanded && title.trim() && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl px-3 py-2 text-slate-300 outline-none cursor-pointer">
              <option value="high">🔴 Ưu tiên cao</option>
              <option value="medium">🟡 Trung bình</option>
              <option value="low">🔵 Thấp</option>
            </select>
            {!isDefault && (
              <input type="date" value={dueDate} min={minDate}
                onChange={e => { setDueDate(e.target.value); setRemindStart('now') }}
                className="text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl px-3 py-2 text-slate-300 outline-none cursor-pointer" />
            )}
          </div>

          {/* Reminder interval */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">Nhắc Telegram lặp lại mỗi:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Không', value: '' },
                { label: '1 phút', value: '1' },
                { label: '5 phút', value: '5' },
                { label: '15 phút', value: '15' },
                { label: 'Tuỳ chỉnh', value: 'custom' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setRemindMin(opt.value)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border
                    ${remindMin === opt.value
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-[#1a1d27] border-[#2a2f45] text-slate-400 hover:text-white hover:border-slate-500'}`}>
                  {opt.label}
                </button>
              ))}
              {remindMin === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max="1440" placeholder="phút"
                    value={customMin} onChange={e => setCustomMin(e.target.value)}
                    className="w-24 text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" />
                  <span className="text-sm text-slate-500">phút</span>
                </div>
              )}
            </div>
          </div>

          {/* Remind start mode — show as soon as a future date is selected */}
          {isFutureDate && (
            <div className="rounded-xl border border-[#2a2f45] bg-[#1a1d27] p-3 space-y-2">
              <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Bắt đầu thông báo từ khi nào?
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRemindStart('now')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-all cursor-pointer
                    ${remindStart === 'now'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                      : 'bg-[#252a40] border-[#2a2f45] text-slate-400 hover:text-white'}`}>
                  Hằng ngày ngay bây giờ
                </button>
                <button type="button" onClick={() => setRemindStart('due_date')}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-all cursor-pointer
                    ${remindStart === 'due_date'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                      : 'bg-[#252a40] border-[#2a2f45] text-slate-400 hover:text-white'}`}>
                  Đúng ngày {dueDate}
                </button>
              </div>
              <p className="text-[11px] text-slate-600">
                {remindStart === 'now'
                  ? effectiveRemind ? `Nhắc mỗi ${effectiveRemind} phút bắt đầu từ bây giờ` : 'Chọn chu kỳ nhắc bên trên'
                  : effectiveRemind ? `Nhắc mỗi ${effectiveRemind} phút bắt đầu từ 00:00 ngày ${dueDate}` : 'Chọn chu kỳ nhắc bên trên'}
              </p>
            </div>
          )}
          {/* ── Remind before X days — only for future dates ── */}
          {isFutureDate && (
            <div className="rounded-xl border border-[#2a2f45] bg-[#1a1d27] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  Nhắc trước ngày hết hạn
                </div>
                {/* Toggle on/off */}
                <div onClick={() => setRemindBefore(p => !p)}
                  className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${remindBefore ? 'bg-blue-600' : 'bg-slate-600'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${remindBefore ? 'left-5' : 'left-1'}`} />
                </div>
              </div>
              {remindBefore && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Nhắc lúc 10:00 sáng trước</span>
                  <input type="number" min="1" max="30" value={remindBeforeDays}
                    onChange={e => setRemindBeforeDays(e.target.value)}
                    className="w-14 text-sm bg-[#252a40] border border-[#2a2f45] rounded-lg px-2 py-1 text-white outline-none focus:border-blue-500 text-center" />
                  <span className="text-xs text-slate-400">ngày</span>
                </div>
              )}
              {remindBefore && remindBeforeDays && dueDate && (
                <p className="text-[11px] text-slate-500">
                  Sẽ nhắc lúc 10:00 ngày {(() => {
                    const d = new Date(dueDate)
                    d.setDate(d.getDate() - parseInt(remindBeforeDays || 0))
                    return d.toISOString().slice(0, 10)
                  })()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  )
}


export default function ChecklistCard({ checklist: prop, onDeleted, onTaskAdded }) {
  const [checklist, setChecklist] = useState(prop)
  const [collapsed, setCollapsed] = useState(false)
  const [editTitle, setEditTitle] = useState(false)
  const [titleVal, setTitleVal]   = useState(prop.title)
  const [filter, setFilter]       = useState('all')
  const isDefault    = checklist.is_default
  const clType       = checklist.checklist_type || 'special'
  const isFixed      = clType === 'fixed'
  const isDateType   = clType === 'date'
  const canDelete    = !isDefault   // daily & fixed both have is_default=true
  const canEditTitle = !isDefault

  useEffect(() => {
    // Only sync metadata from prop, never override locally-managed tasks
    setChecklist(prev => ({
      ...prev,
      title: prop.title,
      color: prop.color,
      is_default: prop.is_default,
      updated_at: prop.updated_at,
      // Only take tasks from prop on first load (prev.tasks is empty)
      tasks: prev.tasks?.length ? prev.tasks : (prop.tasks || []),
    }))
    setTitleVal(prop.title)
  }, [prop])

  const tasks       = checklist.tasks || []
  const filtered    = tasks.filter(t =>
    filter === 'done'        ? t.completed :
    filter === 'todo'        ? !t.completed && !t.in_progress :
    filter === 'in_progress' ? t.in_progress && !t.completed :
    true
  )
  const doneCount       = tasks.filter(t => t.completed).length
  const inProgressCount = tasks.filter(t => t.in_progress && !t.completed).length
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  const patchTask = async (tid, data) => {
    const res = await updateTask(tid, data)
    setChecklist(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === tid ? res.data : t) }))
  }

  const removeTask = async (tid) => {
    await deleteTask(tid)
    setChecklist(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== tid) }))
  }

  const handleAddTask = (task) => {
    setChecklist(prev => ({ ...prev, tasks: [...(prev.tasks || []), task] }))
    onTaskAdded?.(checklist.id, task)
  }

  const saveTitle = async () => {
    if (titleVal.trim() && titleVal !== checklist.title) {
      const res = await updateChecklist(checklist.id, { title: titleVal.trim() })
      setChecklist(prev => ({ ...prev, title: res.data.title }))
    }
    setEditTitle(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Xóa checklist "${checklist.title}"?`)) return
    await deleteChecklist(checklist.id)
    onDeleted(checklist.id)
  }

  return (
    // NOTE: no overflow-hidden here so the ReminderDropdown portal is not clipped
    <div className="rounded-2xl border border-[#2a2f45] bg-[#1e2235] shadow-lg" style={{ overflow: 'visible' }}>
      {/* Color bar */}
      <div className="h-1.5 rounded-t-2xl" style={{ background: checklist.color }} />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button onClick={() => setCollapsed(c => !c)}
          className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded-xl hover:bg-white/5">
          {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>

        <div className="flex-1 min-w-0">
          {editTitle ? (
            <input autoFocus value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }}
              className="text-base font-semibold bg-transparent border-b border-blue-500 outline-none text-white w-full"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h3 className={`text-base font-semibold text-white truncate transition-colors ${canEditTitle ? 'cursor-text hover:text-blue-300' : 'cursor-default'}`}
                onClick={() => canEditTitle && setEditTitle(true)}>
                {checklist.title}
              </h3>
              {clType === 'daily' && (
                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  Daily
                </span>
              )}
              {isFixed && (
                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/30 font-medium">
                  Fixed
                </span>
              )}
              {isDateType && (
                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                  📅 Date
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-[#2a2f45] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: checklist.color }} />
            </div>
            <span className="text-xs text-slate-500 flex-shrink-0 font-medium">{doneCount}/{tasks.length}</span>
          </div>
        </div>

        {!collapsed && tasks.length > 0 && (
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl px-3 py-2 text-slate-300 outline-none cursor-pointer">
            <option value="all">Tất cả</option>
            <option value="todo">Chưa làm</option>
            <option value="in_progress">Đang làm {inProgressCount > 0 ? `(${inProgressCount})` : ''}</option>
            <option value="done">Đã xong</option>
          </select>
        )}

        {canDelete && (
          <button onClick={handleDelete}
            className="p-2 rounded-xl text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer">
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="rounded-b-2xl overflow-hidden border-t border-[#2a2f45]/30">
          {filtered.length === 0 && tasks.length > 0 && (
            <div className="px-4 py-3 text-sm text-slate-600 italic">Không có task nào phù hợp.</div>
          )}
          <div className="divide-y divide-[#2a2f45]/40">
            {filtered.map(t => (
              <TaskRow key={t.id} task={t} onUpdate={patchTask} onDelete={removeTask} />
            ))}
          </div>
          <AddTaskForm checklistId={checklist.id} onAdded={handleAddTask} isDefault={isDefault} />
        </div>
      )}
    </div>
  )
}
